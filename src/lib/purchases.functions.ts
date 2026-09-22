import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Ingredient purchase records. Purchases reuse the existing inventory system:
 * a saved purchase raises stock through the existing `apply_stock_change`
 * function, so movements stay in `inventory_movements` like every other change.
 */

export interface PurchaseRecord {
  id: string;
  /**
   * `inventory` keeps the existing stock-raising behaviour. `others` records a
   * pure expense: it never touches inventory stock or movements.
   */
  kind: "inventory" | "others";
  purchasedOn: string;
  supplierName: string;
  itemId: string | null;
  /** Ingredient name for inventory purchases, expense name for others. */
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category: string | null;
  paymentMethod: string | null;
  note: string | null;
}

/** Default expense categories for "Others" records. */
export const OTHERS_CATEGORIES = [
  "Rent",
  "Electricity",
  "Maintenance",
  "Shop Purchase",
  "Kitchen Miscellaneous",
  "Labour / Guard",
  "Transport",
  "Cleaning",
  "Equipment / Furniture",
  "Packaging",
  "Other",
] as const;

export const ownerListPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PurchaseRecord[]> => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "purchases", "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("purchases")
      .select(
        "id, kind, purchased_on, supplier_name, item_id, quantity, unit_price, total_price, note, expense_name, expense_category, unit_label, payment_method, created_at, inventory_items(name, unit)",
      )
      .order("purchased_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Purchase list failed", error);
      throw new Error("We couldn't load purchases. Please try again.");
    }

    return (data ?? []).map((row) => {
      const item = row.inventory_items as { name: string; unit: string } | null;
      const kind = (row.kind ?? "inventory") as "inventory" | "others";
      return {
        id: row.id,
        kind,
        purchasedOn: row.purchased_on,
        supplierName: row.supplier_name,
        itemId: row.item_id,
        itemName:
          kind === "others"
            ? (row.expense_name ?? "Expense")
            : (item?.name ?? "Unknown ingredient"),
        unit: kind === "others" ? (row.unit_label ?? "") : (item?.unit ?? ""),
        quantity: Number(row.quantity),
        unitPrice: Number(row.unit_price),
        totalPrice: Number(row.total_price),
        category: row.expense_category ?? null,
        paymentMethod: row.payment_method ?? null,
        note: row.note ?? null,
      };
    });
  });

export const ownerCreatePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        purchasedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        // Supplier is optional: purchases save fine without one.
        supplierName: z.string().trim().max(80).optional().nullable(),
        itemId: z.string().uuid(),
        quantity: z.number().positive().max(1000000),
        unitPrice: z.number().nonnegative().max(1000000),
        note: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "purchases");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const totalPrice = Number((data.quantity * data.unitPrice).toFixed(2));
    const supplierName = (data.supplierName ?? "").trim();

    const { data: inserted, error } = await supabaseAdmin
      .from("purchases")
      .insert({
        purchased_on: data.purchasedOn,
        supplier_name: supplierName,
        item_id: data.itemId,
        quantity: data.quantity,
        unit_price: data.unitPrice,
        total_price: totalPrice,
        kind: "inventory",
        note: data.note?.trim() || null,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error("Purchase insert failed", error);
      throw new Error("We couldn't save this purchase. Please try again.");
    }

    // Reuse the existing stock-change mechanism so stock and movement history
    // stay consistent with manual adjustments.
    const { error: stockError } = await supabaseAdmin.rpc("apply_stock_change", {
      _item_id: data.itemId,
      _change_type: "add",
      _quantity: data.quantity,
      _note: supplierName ? `Purchase from ${supplierName}` : "Purchase",
      _created_by: context.userId,
    });

    if (stockError) {
      console.error("Purchase stock increase failed", stockError);
      await supabaseAdmin.from("purchases").delete().eq("id", inserted.id);
      throw new Error("We couldn't update stock for this purchase. Please try again.");
    }

    return { ok: true, id: inserted.id, totalPrice };
  });

/**
 * "Others" expense: recorded in the same `purchases` table with `kind = 'others'`
 * so history, permissions and totals reuse the existing system. It deliberately
 * does NOT call `apply_stock_change`, so inventory stock is untouched and the
 * quantity/unit are descriptive only.
 */
export const ownerCreateOtherExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        purchasedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        name: z.string().trim().min(1).max(120),
        category: z.string().trim().min(1).max(60),
        amount: z.number().positive().max(100000000),
        quantity: z.number().nonnegative().max(1000000).optional().nullable(),
        unit: z.string().trim().max(20).optional().nullable(),
        supplierName: z.string().trim().max(80).optional().nullable(),
        paymentMethod: z.string().trim().max(40).optional().nullable(),
        note: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "purchases");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const amount = Number(data.amount.toFixed(2));

    const { data: inserted, error } = await supabaseAdmin
      .from("purchases")
      .insert({
        kind: "others",
        purchased_on: data.purchasedOn,
        supplier_name: (data.supplierName ?? "").trim(),
        item_id: null,
        expense_name: data.name,
        expense_category: data.category,
        quantity: data.quantity ?? 0,
        unit_label: data.unit?.trim() || null,
        unit_price: amount,
        total_price: amount,
        payment_method: data.paymentMethod?.trim() || null,
        note: data.note?.trim() || null,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error("Other expense insert failed", error);
      throw new Error("We couldn't save this expense. Please try again.");
    }

    return { ok: true, id: inserted.id, totalPrice: amount };
  });
