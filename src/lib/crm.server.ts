/**
 * Customer CRM (Phase 1) — server-only helpers.
 *
 * Phase 1 is read-only towards every existing table. CRM records live in the
 * new `crm_*` tables and are derived from the EXISTING order history and
 * profiles; no order row, profile, notification or policy is ever written or
 * changed here. Guest → account merging is intentionally NOT part of Phase 1.
 */

import { normalizePhone } from "@/lib/phone";

export type CrmCustomerType = "guest" | "account";

export interface CrmRecord {
  id: string;
  displayName: string;
  primaryPhone: string;
  customerType: CrmCustomerType;
}

export function maskPhoneNumber(raw: string): string {
  const digits = normalizePhone(raw);
  if (digits.length < 6) return "•••";
  return `+${digits.slice(0, 5)}•••${digits.slice(-3)}`;
}

/**
 * Finds (or creates) the CRM record for a normalised phone number.
 * Idempotent: the phone identity carries a unique constraint, so a repeated
 * call can never produce a duplicate customer.
 */
export async function ensureCrmCustomer(input: {
  phone: string;
  displayName: string;
  customerType: CrmCustomerType;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}): Promise<CrmRecord> {
  const phone = normalizePhone(input.phone);
  const db = await (await import("@/lib/untyped-db.server")).untypedAdmin();

  const existing = await db
    .from("crm_customer_identities")
    .select("crm_customer_id")
    .eq("kind", "phone")
    .eq("value", phone)
    .maybeSingle();

  if (existing.error) throw new Error("CRM_TABLES_MISSING");

  if (existing.data?.crm_customer_id) {
    const id = existing.data.crm_customer_id as string;
    await db
      .from("crm_customers")
      .update({
        display_name: input.displayName,
        customer_type: input.customerType,
        first_order_at: input.firstOrderAt,
        last_order_at: input.lastOrderAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return {
      id,
      displayName: input.displayName,
      primaryPhone: phone,
      customerType: input.customerType,
    };
  }

  const created = await db
    .from("crm_customers")
    .insert({
      display_name: input.displayName,
      primary_phone: phone,
      customer_type: input.customerType,
      first_order_at: input.firstOrderAt,
      last_order_at: input.lastOrderAt,
    })
    .select("id")
    .single();

  if (created.error || !created.data) throw new Error("CRM_TABLES_MISSING");
  const id = created.data.id as string;

  await db
    .from("crm_customer_identities")
    .insert({ kind: "phone", value: phone, source: "order", crm_customer_id: id });

  return {
    id,
    displayName: input.displayName,
    primaryPhone: phone,
    customerType: input.customerType,
  };
}

/** Records who opened or unmasked a customer record. Append-only. */
export async function recordCrmAccess(
  crmCustomerId: string,
  actorId: string,
  action: "view_profile" | "unmask_phone",
): Promise<void> {
  const db = await (await import("@/lib/untyped-db.server")).untypedAdmin();
  await db
    .from("crm_access_audit")
    .insert({ crm_customer_id: crmCustomerId, actor_id: actorId, action });
}
