import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RewardRule = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  points: number;
  isEnabled: boolean;
  requiresClaim: boolean;
  sortOrder: number;
};

export type RewardTransaction = {
  id: string;
  points: number;
  description: string;
  createdAt: string;
};

export type RewardClaim = {
  id: string;
  userId: string;
  ruleId: string;
  ruleName: string;
  reference: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: string;
};

type RuleRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  points: number;
  is_enabled: boolean;
  requires_claim: boolean;
  sort_order: number;
};

function toRule(row: RuleRow): RewardRule {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    points: row.points,
    isEnabled: row.is_enabled,
    requiresClaim: row.requires_claim,
    sortOrder: row.sort_order,
  };
}

const RULE_COLUMNS =
  "id, slug, name, description, points, is_enabled, requires_claim, sort_order";

export const getMyRewards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [rulesResult, transactionsResult, claimsResult] = await Promise.all([
      context.supabase
        .from("reward_rules")
        .select(RULE_COLUMNS)
        .eq("is_enabled", true)
        .order("sort_order"),
      context.supabase
        .from("reward_transactions")
        .select("id, points, description, created_at")
        .order("created_at", { ascending: false }),
      context.supabase
        .from("reward_claims")
        .select("id, user_id, rule_id, reference, note, status, review_note, created_at, reward_rules(name)")
        .order("created_at", { ascending: false }),
    ]);

    if (rulesResult.error || transactionsResult.error || claimsResult.error) {
      throw new Error("We couldn't load your rewards. Please try again.");
    }

    const transactions: RewardTransaction[] = (transactionsResult.data ?? []).map((row) => ({
      id: row.id,
      points: row.points,
      description: row.description,
      createdAt: row.created_at,
    }));
    const claims: RewardClaim[] = (claimsResult.data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      ruleId: row.rule_id,
      ruleName: Array.isArray(row.reward_rules)
        ? (row.reward_rules[0]?.name ?? "Reward claim")
        : (row.reward_rules?.name ?? "Reward claim"),
      reference: row.reference,
      note: row.note,
      status: row.status as RewardClaim["status"],
      reviewNote: row.review_note,
      createdAt: row.created_at,
    }));

    return {
      balance: transactions.reduce((sum, row) => sum + row.points, 0),
      rules: (rulesResult.data ?? []).map((row) => toRule(row as RuleRow)),
      transactions,
      claims,
    };
  });

export const submitRewardClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ruleId: z.string().uuid(),
        reference: z.string().trim().min(3).max(240),
        note: z.string().trim().max(500).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("reward_claims").insert({
      user_id: context.userId,
      rule_id: data.ruleId,
      reference: data.reference,
      note: data.note,
    });
    if (error?.code === "23505") throw new Error("You already submitted this reward claim.");
    if (error) throw new Error("We couldn't submit your claim. Please try again.");
    return { ok: true };
  });

export const ownerGetRewards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "coupons");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [rulesResult, claimsResult] = await Promise.all([
      supabaseAdmin.from("reward_rules").select(RULE_COLUMNS).order("sort_order"),
      supabaseAdmin
        .from("reward_claims")
        .select("id, user_id, rule_id, reference, note, status, review_note, created_at, reward_rules(name)")
        .order("created_at", { ascending: false }),
    ]);
    if (rulesResult.error || claimsResult.error) {
      throw new Error("We couldn't load rewards management.");
    }
    const claims: RewardClaim[] = (claimsResult.data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      ruleId: row.rule_id,
      ruleName: Array.isArray(row.reward_rules)
        ? (row.reward_rules[0]?.name ?? "Reward claim")
        : (row.reward_rules?.name ?? "Reward claim"),
      reference: row.reference,
      note: row.note,
      status: row.status as RewardClaim["status"],
      reviewNote: row.review_note,
      createdAt: row.created_at,
    }));
    return {
      rules: (rulesResult.data ?? []).map((row) => toRule(row as RuleRow)),
      claims,
    };
  });

export const ownerUpdateRewardRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), points: z.number().int().min(0).max(1_000_000), isEnabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "coupons");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("reward_rules")
      .update({ points: data.points, is_enabled: data.isEnabled })
      .eq("id", data.id);
    if (error) throw new Error("We couldn't save this reward action.");
    return { ok: true };
  });

export const ownerReviewRewardClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ claimId: z.string().uuid(), decision: z.enum(["approved", "rejected"]), reviewNote: z.string().trim().max(500).nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "coupons");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: claim, error: claimError } = await supabaseAdmin
      .from("reward_claims")
      .select("id, user_id, rule_id, status, reward_rules(slug, name, points)")
      .eq("id", data.claimId)
      .single();
    if (claimError || !claim) throw new Error("Reward claim not found.");
    if (claim.status !== "pending") throw new Error("This claim has already been reviewed.");

    const rule = Array.isArray(claim.reward_rules) ? claim.reward_rules[0] : claim.reward_rules;
    if (!rule) throw new Error("This reward action is no longer available.");
    if (data.decision === "approved" && rule.points > 0) {
      const { error: transactionError } = await supabaseAdmin.from("reward_transactions").insert({
        user_id: claim.user_id,
        rule_id: claim.rule_id,
        action_key: rule.slug,
        reference_id: claim.id,
        points: rule.points,
        description: rule.name,
      });
      if (transactionError?.code === "23505") throw new Error("Points were already awarded for this claim.");
      if (transactionError) throw new Error("We couldn't award these points.");
    }

    const { error } = await supabaseAdmin
      .from("reward_claims")
      .update({ status: data.decision, review_note: data.reviewNote, reviewed_by: context.userId, reviewed_at: new Date().toISOString() })
      .eq("id", claim.id)
      .eq("status", "pending");
    if (error) throw new Error("We couldn't update this claim.");
    return { ok: true };
  });

export const listMyVouchers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabaseAdmin
      .from("coupons")
      .select("id, code, description, discount_type, discount_value, min_order_total, max_discount, expires_on")
      .eq("is_active", true)
      .or(`starts_on.is.null,starts_on.lte.${today}`)
      .or(`expires_on.is.null,expires_on.gte.${today}`)
      .order("created_at", { ascending: false });
    if (error) throw new Error("We couldn't load vouchers.");
    return data ?? [];
  });