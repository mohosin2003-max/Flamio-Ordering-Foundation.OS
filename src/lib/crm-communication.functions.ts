/**
 * Customer CRM (Phase 3) — communication FOUNDATION. Read-only.
 *
 * This module answers three questions for one CRM customer, using only tables
 * that already exist:
 *
 *   1. Which channels can actually reach this customer right now?
 *      - IN_APP  → existing `customer_conversations` inbox (account holders)
 *      - PUSH    → existing `push_tokens` + configured VAPID keys
 *      - SMS / WHATSAPP / EMAIL → no customer-messaging provider is connected,
 *        so they are reported as "not configured". A stored phone number or
 *        email address is NEVER treated as a usable channel.
 *   2. Which communication categories are allowed (transactional vs marketing)?
 *      There is no preference table yet, so conservative product defaults are
 *      reported and marketing is reported as not enabled for anyone.
 *   3. What has already been sent? Built from the existing `notifications`
 *      history and the existing customer conversation messages.
 *
 * Nothing here sends anything, calls any provider, writes any row, or changes
 * any notification, push, auth or order behaviour.
 */

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePhone } from "@/lib/phone";

export type CommunicationChannel = "in_app" | "push" | "sms" | "whatsapp" | "email";

export type ChannelState = "available" | "unavailable" | "not_configured";

export interface ChannelStatus {
  channel: CommunicationChannel;
  label: string;
  state: ChannelState;
  /** Plain-language reason, safe to show to any authorised staff member. */
  detail: string;
}

export interface CommunicationPreference {
  category: "transactional" | "service" | "marketing";
  label: string;
  enabled: boolean;
  detail: string;
}

export interface CommunicationHistoryItem {
  id: string;
  channel: CommunicationChannel;
  category: "transactional" | "service" | "marketing";
  title: string;
  preview: string;
  createdAt: string;
  status: "sent" | "delivered" | "queued" | "failed";
}

export interface CrmCommunicationView {
  customerType: "guest" | "account";
  accountLinked: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  channels: ChannelStatus[];
  preferences: CommunicationPreference[];
  history: CommunicationHistoryItem[];
  canSeeHistory: boolean;
  /** True only when at least one channel can genuinely deliver today. */
  canMessage: boolean;
  /** Existing owner inbox conversation for this customer, when one exists. */
  conversationId: string | null;
}

const NOT_CONFIGURED = (channel: CommunicationChannel, label: string, detail: string): ChannelStatus => ({
  channel,
  label,
  state: "not_configured",
  detail,
});

export const crmGetCommunication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string }) => input)
  .handler(async ({ data, context }): Promise<CrmCommunicationView> => {
    const { assertAnyPermission } = await import("@/lib/owner.server");
    await assertAnyPermission(context.userId, ["customer_profiles", "customers"], "view");

    let canSeeHistory = true;
    try {
      await assertAnyPermission(
        context.userId,
        ["communication_logs", "customer_profiles", "customers"],
        "view",
      );
    } catch {
      canSeeHistory = false;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { looseDb } = await import("@/integrations/supabase/loose.server");
    const { canonicalEmail } = await import("@/lib/crm-identity.server");
    const db = looseDb(supabaseAdmin);
    const phone = normalizePhone(data.phone);

    // Who is this, as an authentication identity? Only deterministic matches:
    // an order that carries the auth user id, or a profile whose own phone
    // number is an exact canonical match (same rule as Phase 2).
    const { data: orderRows } = await supabaseAdmin
      .from("orders")
      .select("user_id, customer_phone")
      .not("user_id", "is", null)
      .limit(5000);
    let authUserId: string | null =
      (orderRows ?? []).find((row) => normalizePhone(row.customer_phone) === phone)?.user_id ?? null;

    const { data: profileRows } = await supabaseAdmin
      .from("profiles")
      .select("id, phone, email")
      .limit(5000);
    const profile = (profileRows ?? []).find((row) => row.phone && normalizePhone(row.phone) === phone);
    if (!authUserId && profile) authUserId = null; // an unlinked match is not an identity
    const email = authUserId ? canonicalEmail(profile?.email ?? null) : null;

    // PUSH — a real, active subscription plus configured server keys.
    const { pushConfigured } = await import("@/lib/push.server");
    let activeDevices = 0;
    if (authUserId) {
      const { data: tokens } = await db
        .from("push_tokens")
        .select("id")
        .eq("user_id", authUserId)
        .eq("is_active", true);
      activeDevices = (tokens ?? []).length;
    }

    // IN_APP — the existing customer inbox thread.
    let conversationId: string | null = null;
    if (authUserId) {
      const { data: conversation } = await db
        .from("customer_conversations")
        .select("id")
        .eq("customer_user_id", authUserId)
        .maybeSingle();
      conversationId = (conversation?.id as string | undefined) ?? null;
    }

    const pushReady = Boolean(authUserId) && activeDevices > 0 && pushConfigured();

    const channels: ChannelStatus[] = [
      {
        channel: "in_app",
        label: "In-app inbox",
        state: authUserId ? "available" : "unavailable",
        detail: authUserId
          ? conversationId
            ? "Account holder with an existing conversation."
            : "Account holder — a conversation can be opened when they write in."
          : "Guest customer — there is no account inbox to deliver to.",
      },
      {
        channel: "push",
        label: "Phone / browser push",
        state: pushReady ? "available" : "unavailable",
        detail: !authUserId
          ? "Guest customer — push needs a signed-in device."
          : activeDevices === 0
            ? "No device has notifications switched on."
            : pushConfigured()
              ? `${activeDevices} device${activeDevices === 1 ? "" : "s"} switched on.`
              : "Push keys are not configured on the server.",
      },
      NOT_CONFIGURED(
        "sms",
        "SMS",
        "No customer-messaging SMS provider is connected. The existing SMS setup is used only for login codes.",
      ),
      NOT_CONFIGURED("whatsapp", "WhatsApp", "No WhatsApp provider is connected."),
      NOT_CONFIGURED("email", "Email", "No email delivery provider is connected."),
    ];

    const preferences: CommunicationPreference[] = [
      {
        category: "transactional",
        label: "Order updates",
        enabled: true,
        detail: "Order notifications continue exactly as today, in-app and push.",
      },
      {
        category: "service",
        label: "Customer service replies",
        enabled: Boolean(authUserId),
        detail: authUserId
          ? "Replies reach this customer through their inbox."
          : "Guest customer — no inbox to reply into.",
      },
      {
        category: "marketing",
        label: "Offers & promotions",
        enabled: false,
        detail: "Nobody is opted in. Marketing sending is not built, and no consent is stored yet.",
      },
    ];

    const history: CommunicationHistoryItem[] = [];
    if (canSeeHistory && authUserId) {
      const [{ data: notifications }, { data: messages }] = await Promise.all([
        db
          .from("notifications")
          .select("id, kind, title, body, created_at")
          .eq("user_id", authUserId)
          .order("created_at", { ascending: false })
          .limit(30),
        conversationId
          ? db
              .from("customer_conversation_messages")
              .select("id, sender_role, sender_name, body, created_at")
              .eq("conversation_id", conversationId)
              .order("created_at", { ascending: false })
              .limit(30)
          : Promise.resolve({ data: [] as unknown[] }),
      ]);

      for (const row of (notifications ?? []) as {
        id: string;
        kind: string | null;
        title: string;
        body: string | null;
        created_at: string;
      }[]) {
        history.push({
          id: `n-${row.id}`,
          channel: "in_app",
          category: row.kind === "broadcast" ? "marketing" : "transactional",
          title: row.title,
          preview: (row.body ?? "").slice(0, 140),
          createdAt: row.created_at,
          status: "sent",
        });
      }

      for (const row of (messages ?? []) as {
        id: string;
        sender_role: string;
        sender_name: string | null;
        body: string;
        created_at: string;
      }[]) {
        history.push({
          id: `m-${row.id}`,
          channel: "in_app",
          category: "service",
          title: row.sender_role === "staff" ? "Reply from the team" : "Message from customer",
          preview: row.body.slice(0, 140),
          createdAt: row.created_at,
          status: "sent",
        });
      }

      history.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    return {
      customerType: authUserId ? "account" : "guest",
      accountLinked: Boolean(authUserId),
      hasPhone: phone.length > 5,
      hasEmail: Boolean(email),
      channels,
      preferences,
      history: history.slice(0, 40),
      canSeeHistory,
      canMessage: Boolean(authUserId) && (pushReady || Boolean(conversationId) || true),
      conversationId,
    };
  });
