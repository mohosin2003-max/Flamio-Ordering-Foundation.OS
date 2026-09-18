import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Staff Accounts & Financial Ledger.
 *
 * Reuses the EXISTING people in `public.user_roles` + `public.profiles`; money
 * records live in the `staff_salary_profiles` / `staff_ledger_entries` tables.
 * Corrections are logged in `staff_ledger_audit`. Purchases, POS, orders and
 * sales reports are untouched.
 */

/** Selectable record types (legacy `advance` rows are read as personal advance). */
export const LEDGER_TYPES = [
  "salary_payment",
  "salary_advance",
  "personal_advance",
  "loan",
  "loan_repayment",
  "bonus",
  "deduction",
  "overtime",
  "other",
] as const;

/** Everything the database accepts, including the legacy `advance` type. */
export const LEDGER_TYPES_ALL = [...LEDGER_TYPES, "advance"] as const;

export type LedgerType = (typeof LEDGER_TYPES_ALL)[number];

export const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
  salary_payment: "Salary payment",
  salary_advance: "Salary advance",
  personal_advance: "Personal advance",
  advance: "Personal advance (old record)",
  loan: "Loan given",
  loan_repayment: "Loan repayment",
  bonus: "Bonus",
  deduction: "Deduction",
  overtime: "Overtime pay",
  other: "Other",
};

export const PAYMENT_METHODS = ["cash", "bank", "mobile"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type SalaryProfile = {
  payType: "monthly" | "daily";
  monthlyRate: number;
  dailyRate: number;
  overtimeHourlyRate: number;
  payday: number;
  startsOn: string | null;
  isActive: boolean;
};

export type LedgerEntry = {
  id: string;
  userId: string;
  entryType: LedgerType;
  amount: number;
  entryDate: string;
  paymentMethod: PaymentMethod | null;
  note: string | null;
  createdAt: string;
  updatedAt: string | null;
  wasCorrected: boolean;
};

export type LedgerSnapshot = {
  entry_type?: string;
  amount?: number | string;
  entry_date?: string;
  payment_method?: string | null;
  note?: string | null;
};

export type LedgerAuditRow = {
  id: string;
  entryId: string;
  action: "create" | "update" | "delete";
  reason: string | null;
  before: LedgerSnapshot | null;
  after: LedgerSnapshot | null;
  changedByName: string | null;
  createdAt: string;
};

export type StaffAccount = {
  userId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  roles: string[];
  profile: SalaryProfile | null;
  /** Salary + salary advance + overtime + bonus paid inside the selected month. */
  paidThisMonth: number;
  /** Monthly salary still unpaid for the selected month (monthly pay only). */
  salaryDue: number;
  outstandingAdvance: number;
  outstandingLoan: number;
  lifetimePaid: number;
};

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const monthBounds = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const next = m === 12 ? `${y! + 1}-01-01` : `${y}-${String(m! + 1).padStart(2, "0")}-01`;
  return { from, to: next };
};

const sum = (rows: { entry_type: string; amount: number | string }[], types: LedgerType[]) =>
  rows
    .filter((r) => types.includes(r.entry_type as LedgerType))
    .reduce((acc, r) => acc + Number(r.amount), 0);

/** Team members with their salary setup and computed balances. */
export const ownerListStaffAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ month: monthSchema }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ accounts: StaffAccount[]; payrollPaid: number; month: string }> => {
      const { assertPermission } = await import("@/lib/owner.server");
      await assertPermission(context.userId, "staff_finance");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: roleRows, error: roleError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .order("created_at");
      if (roleError) {
        console.error("Staff accounts: role load failed", roleError);
        throw new Error("We couldn't load your team. Please try again.");
      }

      const userIds = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
      if (!userIds.length) return { accounts: [], payrollPaid: 0, month: data.month };

      const [{ data: profiles }, { data: salaryRows }, { data: entryRows }] = await Promise.all([
        supabaseAdmin.from("profiles").select("id, full_name, phone, email").in("id", userIds),
        supabaseAdmin.from("staff_salary_profiles").select("*").in("user_id", userIds),
        supabaseAdmin
          .from("staff_ledger_entries")
          .select("user_id, entry_type, amount, entry_date")
          .in("user_id", userIds),
      ]);

      const { from, to } = monthBounds(data.month);
      const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));
      const salaryById = new Map((salaryRows ?? []).map((s) => [s.user_id as string, s]));

      const accounts: StaffAccount[] = userIds.map((userId) => {
        const p = profileById.get(userId);
        const s = salaryById.get(userId);
        const all = (entryRows ?? []).filter((e) => e.user_id === userId);
        const inMonth = all.filter((e) => e.entry_date >= from && e.entry_date < to);

        // Salary advance is money against this month's salary, so it counts as paid.
        const paidThisMonth = sum(inMonth, [
          "salary_payment",
          "salary_advance",
          "overtime",
          "bonus",
        ]);
        const monthlyRate = s ? Number(s.monthly_rate) : 0;
        // Salary due drops once for salary payments, salary advances and deductions.
        // Loans and personal advances never touch it.
        const salaryDue =
          s && s.pay_type === "monthly" && s.is_active
            ? Math.max(
                monthlyRate -
                  sum(inMonth, ["salary_payment", "salary_advance"]) -
                  sum(inMonth, ["deduction"]),
                0,
              )
            : 0;

        return {
          userId,
          fullName: p?.full_name ?? null,
          phone: p?.phone ?? null,
          email: p?.email ?? null,
          roles: (roleRows ?? []).filter((r) => r.user_id === userId).map((r) => r.role as string),
          profile: s
            ? {
                payType: s.pay_type as "monthly" | "daily",
                monthlyRate,
                dailyRate: Number(s.daily_rate),
                overtimeHourlyRate: Number(s.overtime_hourly_rate),
                payday: s.payday,
                startsOn: s.starts_on,
                isActive: s.is_active,
              }
            : null,
          paidThisMonth,
          salaryDue,
          // Personal advances (incl. legacy rows) are recovered through deductions.
          outstandingAdvance: Math.max(
            sum(all, ["personal_advance", "advance"]) - sum(all, ["deduction"]),
            0,
          ),
          // Loans stand on their own and are only cleared by loan repayments.
          outstandingLoan: Math.max(sum(all, ["loan"]) - sum(all, ["loan_repayment"]), 0),
          lifetimePaid: sum(all, [
            "salary_payment",
            "salary_advance",
            "overtime",
            "bonus",
            "personal_advance",
            "advance",
            "loan",
          ]),
        };
      });

      const payrollPaid = accounts.reduce((acc, a) => acc + a.paidThisMonth, 0);
      return { accounts, payrollPaid, month: data.month };
    },
  );

/** Full dated history for one person, filterable by month, date range and type. */
export const ownerListLedgerEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        month: monthSchema.nullable().optional(),
        fromDate: dateSchema.nullable().optional(),
        toDate: dateSchema.nullable().optional(),
        entryType: z.enum(LEDGER_TYPES_ALL).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<LedgerEntry[]> => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "staff_finance");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("staff_ledger_entries")
      .select(
        "id, user_id, entry_type, amount, entry_date, payment_method, note, created_at, updated_at, updated_by",
      )
      .eq("user_id", data.userId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.month) {
      const { from, to } = monthBounds(data.month);
      query = query.gte("entry_date", from).lt("entry_date", to);
    }
    if (data.fromDate) query = query.gte("entry_date", data.fromDate);
    if (data.toDate) query = query.lte("entry_date", data.toDate);
    if (data.entryType) query = query.eq("entry_type", data.entryType);

    const { data: rows, error } = await query;
    if (error) {
      console.error("Ledger list failed", error);
      throw new Error("We couldn't load these records. Please try again.");
    }

    return (rows ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      entryType: r.entry_type as LedgerType,
      amount: Number(r.amount),
      entryDate: r.entry_date,
      paymentMethod: (r.payment_method as PaymentMethod | null) ?? null,
      note: r.note,
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? null,
      wasCorrected: Boolean((r as { updated_by?: string | null }).updated_by),
    }));
  });

/** Correction history for one person's records. */
export const ownerListLedgerAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<LedgerAuditRow[]> => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "staff_finance");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("staff_ledger_audit")
      .select("id, entry_id, action, reason, before_data, after_data, changed_by, created_at")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Ledger audit list failed", error);
      throw new Error("We couldn't load the change history. Please try again.");
    }

    const changerIds = Array.from(
      new Set((rows ?? []).map((r) => r.changed_by).filter((v): v is string => Boolean(v))),
    );
    const names = new Map<string, string | null>();
    if (changerIds.length) {
      const { data: people } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", changerIds);
      for (const p of people ?? []) names.set(p.id as string, p.full_name);
    }

    return (rows ?? []).map((r) => ({
      id: r.id,
      entryId: r.entry_id,
      action: r.action as "create" | "update" | "delete",
      reason: r.reason,
      before: (r.before_data as LedgerSnapshot | null) ?? null,
      after: (r.after_data as LedgerSnapshot | null) ?? null,
      changedByName: r.changed_by ? (names.get(r.changed_by) ?? null) : null,
      createdAt: r.created_at,
    }));
  });

/** Creates or replaces one person's salary setup. */
export const ownerSaveSalaryProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        payType: z.enum(["monthly", "daily"]),
        monthlyRate: z.number().nonnegative().max(100000000),
        dailyRate: z.number().nonnegative().max(100000000),
        overtimeHourlyRate: z.number().nonnegative().max(100000000),
        payday: z.number().int().min(1).max(31),
        startsOn: dateSchema.nullable(),
        isActive: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "staff_finance");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("staff_salary_profiles").upsert(
      {
        user_id: data.userId,
        pay_type: data.payType,
        monthly_rate: data.monthlyRate,
        daily_rate: data.dailyRate,
        overtime_hourly_rate: data.overtimeHourlyRate,
        payday: data.payday,
        starts_on: data.startsOn,
        is_active: data.isActive,
      },
      { onConflict: "user_id" },
    );

    if (error) {
      console.error("Save salary profile failed", error);
      throw new Error("We couldn't save this salary setup. Please try again.");
    }
    return { ok: true };
  });

const entryFields = {
  entryType: z.enum(LEDGER_TYPES),
  amount: z.number().nonnegative().max(100000000),
  entryDate: dateSchema,
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  note: z.string().trim().max(300).nullable(),
};

/** Records one money event for a team member. */
export const ownerCreateLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), ...entryFields }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "staff_finance");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin
      .from("staff_ledger_entries")
      .insert({
        user_id: data.userId,
        entry_type: data.entryType,
        amount: data.amount,
        entry_date: data.entryDate,
        payment_method: data.paymentMethod,
        note: data.note,
        recorded_by: context.userId,
      })
      .select("id, entry_type, amount, entry_date, payment_method, note")
      .single();

    if (error || !created) {
      console.error("Create ledger entry failed", error);
      throw new Error("We couldn't save this record. Please try again.");
    }

    await supabaseAdmin.from("staff_ledger_audit").insert({
      entry_id: created.id,
      user_id: data.userId,
      action: "create",
      after_data: created,
      changed_by: context.userId,
    });

    return { ok: true, id: created.id };
  });

/** Corrects a mistake on an existing record and logs the change. */
export const ownerUpdateLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        ...entryFields,
        reason: z.string().trim().min(1).max(300),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "staff_finance");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before, error: loadError } = await supabaseAdmin
      .from("staff_ledger_entries")
      .select("id, user_id, entry_type, amount, entry_date, payment_method, note")
      .eq("id", data.id)
      .maybeSingle();

    if (loadError || !before) {
      console.error("Ledger entry load for update failed", loadError);
      throw new Error("We couldn't find this record.");
    }

    const { data: after, error } = await supabaseAdmin
      .from("staff_ledger_entries")
      .update({
        entry_type: data.entryType,
        amount: data.amount,
        entry_date: data.entryDate,
        payment_method: data.paymentMethod,
        note: data.note,
        updated_by: context.userId,
      })
      .eq("id", data.id)
      .select("id, entry_type, amount, entry_date, payment_method, note")
      .single();

    if (error || !after) {
      console.error("Update ledger entry failed", error);
      throw new Error("We couldn't save this correction. Please try again.");
    }

    await supabaseAdmin.from("staff_ledger_audit").insert({
      entry_id: data.id,
      user_id: before.user_id,
      action: "update",
      before_data: before,
      after_data: after,
      reason: data.reason,
      changed_by: context.userId,
    });

    return { ok: true };
  });

export const ownerDeleteLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), reason: z.string().trim().max(300).nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "staff_finance");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before } = await supabaseAdmin
      .from("staff_ledger_entries")
      .select("id, user_id, entry_type, amount, entry_date, payment_method, note")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("staff_ledger_entries").delete().eq("id", data.id);
    if (error) {
      console.error("Delete ledger entry failed", error);
      throw new Error("We couldn't remove this record. Please try again.");
    }

    if (before) {
      await supabaseAdmin.from("staff_ledger_audit").insert({
        entry_id: before.id,
        user_id: before.user_id,
        action: "delete",
        before_data: before,
        reason: data.reason ?? null,
        changed_by: context.userId,
      });
    }

    return { ok: true };
  });
