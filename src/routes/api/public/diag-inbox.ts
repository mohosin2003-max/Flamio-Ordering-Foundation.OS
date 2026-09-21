import { createFileRoute } from "@tanstack/react-router";

// TEMPORARY diagnostic endpoint. Removed immediately after debugging.
const TOKEN = "d9f1c4a7-diag";

export const Route = createFileRoute("/api/public/diag-inbox")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("t") !== TOKEN) return new Response("no", { status: 404 });
        const out: Record<string, unknown> = {};
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { looseDb } = await import("@/integrations/supabase/loose.server");
          const db = looseDb(supabaseAdmin);
          const userId = url.searchParams.get("u") ?? "";
          const { data: user, error } = await supabaseAdmin.auth.admin.getUserById(userId);
          out["user"] = { email: user?.user?.email, phone: user?.user?.phone, error: error?.message };
          if (user?.user?.email) {
            const link = await supabaseAdmin.auth.admin.generateLink({
              type: "magiclink",
              email: user.user.email,
            });
            out["hashed_token"] = link.data?.properties?.hashed_token ?? null;
            out["linkError"] = link.error?.message ?? null;
          }
          const conv = await db.from("customer_conversations").select("id, customer_user_id");
          out["settings"] = (await db.from("restaurant_settings").select("contact_inbox_enabled, contact_call_restaurant_enabled").limit(1).maybeSingle()).data;
          out["roles"] = (await db.from("user_roles").select("user_id, role")).data;
          out["conversations"] = conv.data;
          const msgs = await db
            .from("customer_conversation_messages")
            .select("id, conversation_id, sender_role, body, created_at")
            .order("created_at", { ascending: false })
            .limit(5);
          out["messages"] = msgs.data;
        } catch (thrown) {
          out["thrown"] = thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown);
        }
        return new Response(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
