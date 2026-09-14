import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Inventory management. Every handler re-checks the caller's owner role with
 * `assertOwner` before touching data through the service-role client, matching
 * the existing owner endpoints. Customers can never reach these tables: RLS
 * only allows owner/admin, and the stock RPCs are service-role only.
 */

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  lowStockThreshold: number;
  unitCost: number | null;
  isActive: boolean;
  isLow: boolean;
}

export interface RecipeLine {
  id: string;
  productId: string;
  itemId: string;
  quantity: number;
}

export const UNITS = ["pcs", "kg", "g", "liter", "ml", "slice", "pack"] as const;

export const ownerListInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ items: InventoryItem[]; lowStockCount: number; recipes: RecipeLine[] }> => {
      const { assertPermission } = await import("@/lib/owner.server");
      await assertPermission(context.userId, "inventory");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const [{ data: rows, error }, { data: recipeRows }] = await Promise.all([
        supabaseAdmin
          .from("inventory_items")
          .select("id, name, unit, current_stock, low_stock_threshold, unit_cost, is_active")
          .order("name"),
        supabaseAdmin.from("product_ingredients").select("id, product_id, item_id, quantity"),
      ]);

      if (error) {
        console.error("Inventory list failed", error);
        throw new Error("We couldn't load inventory. Please try again.");
      }

      const items = (rows ?? []).map((r) => {
        const currentStock = Number(r.current_stock);
        const lowStockThreshold = Number(r.low_stock_threshold);
        return {
          id: r.id,
          name: r.name,
          unit: r.unit,
          currentStock,
          lowStockThreshold,
          unitCost: r.unit_cost === null ? null : Number(r.unit_cost),
          isActive: r.is_active,
          isLow: r.is_active && currentStock <= lowStockThreshold,
        };
      });

      return {
        items,
        lowStockCount: items.filter((i) => i.isLow).length,
        recipes: (recipeRows ?? []).map((r) => ({
          id: r.id,
          productId: r.product_id,
          itemId: r.item_id,
          quantity: Number(r.quantity),
        })),
      };
    },
  );

export const ownerSaveInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        name: z.string().trim().min(2).max(60),
        unit: z.string().trim().min(1).max(20),
        lowStockThreshold: z.number().nonnegative().max(1000000),
        unitCost: z.number().nonnegative().max(1000000).nullable(),
        isActive: z.boolean(),
        /** Only used when creating a new item. */
        initialStock: z.number().nonnegative().max(1000000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "inventory");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const row = {
      name: data.name,
      unit: data.unit,
      low_stock_threshold: data.lowStockThreshold,
      unit_cost: data.unitCost,
      is_active: data.isActive,
    };

    const { error } = data.id
      ? await supabaseAdmin.from("inventory_items").update(row).eq("id", data.id)
      : await supabaseAdmin
          .from("inventory_items")
          .insert({ ...row, current_stock: data.initialStock ?? 0 });

    if (error) {
      console.error("Save inventory item failed", error);
      throw new Error(
        error.code === "23505"
          ? "An inventory item with that name already exists."
          : "We couldn't save this inventory item. Please try again.",
      );
    }
    return { ok: true };
  });

/** Manual stock movement. Negative stock is blocked inside the DB function. */
export const ownerAdjustStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        changeType: z.enum(["add", "reduce", "update"]),
        quantity: z.number().nonnegative().max(1000000),
        note: z.string().trim().max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "inventory");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: newStock, error } = await supabaseAdmin.rpc("apply_stock_change", {
      _item_id: data.itemId,
      _change_type: data.changeType,
      _quantity: data.quantity,
      ...(data.note ? { _note: data.note } : {}),
      _created_by: context.userId,
    });

    if (error) {
      console.error("Stock change failed", error);
      throw new Error(
        error.message.includes("Not enough stock")
          ? "That would take stock below zero."
          : "We couldn't update stock. Please try again.",
      );
    }
    return { ok: true, currentStock: Number(newStock) };
  });

/** Replaces the full ingredient list for a menu item. */
export const ownerSaveRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        lines: z
          .array(
            z.object({
              itemId: z.string().uuid(),
              quantity: z.number().positive().max(10000),
            }),
          )
          .max(30),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "inventory");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: clearError } = await supabaseAdmin
      .from("product_ingredients")
      .delete()
      .eq("product_id", data.productId);

    if (clearError) {
      console.error("Clear recipe failed", clearError);
      throw new Error("We couldn't update this recipe. Please try again.");
    }

    if (data.lines.length > 0) {
      const { error } = await supabaseAdmin.from("product_ingredients").insert(
        data.lines.map((l) => ({
          product_id: data.productId,
          item_id: l.itemId,
          quantity: l.quantity,
        })),
      );
      if (error) {
        console.error("Save recipe failed", error);
        throw new Error("We couldn't save this recipe. Please try again.");
      }
    }
    return { ok: true };
  });

export interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  changeType: string;
  quantity: number;
  resultingStock: number;
  note: string | null;
  createdAt: string;
}

/** Read-only stock movement history from the existing movements table. */
export const ownerListStockMovements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StockMovement[]> => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "inventory");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("inventory_movements")
      .select(
        "id, item_id, change_type, quantity, resulting_stock, note, created_at, inventory_items(name, unit)",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Stock movement list failed", error);
      throw new Error("We couldn't load stock history. Please try again.");
    }

    return (data ?? []).map((row) => {
      const item = row.inventory_items as { name: string; unit: string } | null;
      return {
        id: row.id,
        itemId: row.item_id,
        itemName: item?.name ?? "Unknown ingredient",
        unit: item?.unit ?? "",
        changeType: row.change_type,
        quantity: Number(row.quantity),
        resultingStock: Number(row.resulting_stock),
        note: row.note,
        createdAt: row.created_at,
      };
    });
  });
