import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Staff Accounts & Financial Ledger.
 *
 * Reuses the EXISTING people in `public.user_roles` + `public.profiles`; money
 * records live in the new `staff_salary_profiles` / `staff_ledger_entries`
 * tables. Purchases, POS, orders and sales reports are untouched.
 */

export const LEDGER_TYPES = [
  "salary_payment",
  "advance",
  "loan",
  "loan_repayment",
  "bonus",
  "deduction",
  "overtime",
  "other",
] as const;

export type LedgerType = (typeof LEDGER_TYPES)[number];

export const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
  salary_payment: "Salary payment",
  advance: "Advance",
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
};

export type StaffAccount = {
  userId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  roles: string[];
  profile: SalaryProfile | null;
  /** Salary + overtime + bonus paid inside the selected month. */
  paidThisMonth: number;
  /** Monthly salary still unpaid for the selected month (monthly pay only). */
  salaryDue: number;
  outstandingAdvance: number;
  outstandingLoan: number;
  lifetimePaid: number;
};

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);

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

        const paidThisMonth = sum(inMonth, ["salary_payment", "overtime", "bonus"]);
        const monthlyRate = s ? Number(s.monthly_rate) : 0;
        const salaryDue =
          s && s.pay_type === "monthly" && s.is_active
            ? Math.max(monthlyRate - sum(inMonth, ["salary_payment"]) - sum(inMonth, ["deduction"]), 0)
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
          // Advances are recovered through deduction entries.
          outstandingAdvance: Math.max(sum(all, ["advance"]) - sum(all, ["deduction"]), 0),
          outstandingLoan: Math.max(sum(all, ["loan"]) - sum(all, ["loan_repayment"]), 0),
          lifetimePaid: sum(all, ["salary_payment", "overtime", "bonus", "advance", "loan"]),
        };
      });

      const payrollPaid = accounts.reduce((acc, a) => acc + a.paidThisMonth, 0);
      return { accounts, payrollPaid, month: data.month };
    },
  );

/** Full dated history for one person. */
export const ownerListLedgerEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        month: monthSchema.nullable().optional(),
        entryType: z.enum(LEDGER_TYPES).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<LedgerEntry[]> => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "staff_finance");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("staff_ledger_entries")
      .select("id, user_id, entry_type, amount, entry_date, payment_method, note, created_at")
      .eq("user_id", data.userId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.month) {
      const { from, to } = monthBounds(data.month);
      query = query.gte("entry_date", from).lt("entry_date", to);
    }
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
        startsOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
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

/** Records one money event for a team member. */
export const ownerCreateLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        entryType: z.enum(LEDGER_TYPES),
        amount: z.number().nonnegative().max(100000000),
        entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
        note: z.string().trim().max(300).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "staff_finance");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("staff_ledger_entries").insert({
      user_id: data.userId,
      entry_type: data.entryType,
      amount: data.amount,
      entry_date: data.entryDate,
      payment_method: data.paymentMethod,
      note: data.note,
      recorded_by: context.userId,
    });

    if (error) {
      console.error("Create ledger entry failed", error);
      throw new Error("We couldn't save this record. Please try again.");
    }
    return { ok: true };
  });

export const ownerDeleteLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "staff_finance");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("staff_ledger_entries")
      .delete()
      .eq("id", data.id);
    if (error) {
      console.error("Delete ledger entry failed", error);
      throw new Error("We couldn't remove this record. Please try again.");
    }
    return { ok: true };
  });
