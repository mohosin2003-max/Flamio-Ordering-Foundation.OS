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
  purchasedOn: string;
  supplierName: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export const ownerListPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PurchaseRecord[]> => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "purchases");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("purchases")
      .select(
        "id, purchased_on, supplier_name, item_id, quantity, unit_price, total_price, created_at, inventory_items(name, unit)",
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
      return {
        id: row.id,
        purchasedOn: row.purchased_on,
        supplierName: row.supplier_name,
        itemId: row.item_id,
        itemName: item?.name ?? "Unknown ingredient",
        unit: item?.unit ?? "",
        quantity: Number(row.quantity),
        unitPrice: Number(row.unit_price),
        totalPrice: Number(row.total_price),
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
