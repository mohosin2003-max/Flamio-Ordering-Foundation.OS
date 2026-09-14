import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Kitchen Display System endpoints. These reuse the EXISTING `orders` /
 * `order_items` tables and the existing order status lifecycle — no parallel
 * order or status system. Access is enforced server-side via `assertKitchen`.
 */

export interface KitchenOrderItem {
  name: string;
  variantName: string | null;
  quantity: number;
}

export interface KitchenOrder {
  id: string;
  code: string;
  status: string;
  fulfillment: "delivery" | "pickup";
  createdAt: string;
  deliveryNotes: string | null;
  items: KitchenOrderItem[];
}

/** Does the caller have kitchen access (owner, admin or staff)? */
export const getKitchenAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    const roles = (data ?? []).map((r) => r.role as string);
    return {
      hasAccess: roles.some((r) => r === "owner" || r === "admin" || r === "staff"),
      roles,
    };
  });

/**
 * Active kitchen queue. Only kitchen-relevant fields are returned — no
 * customer address, phone or payment data, preserving customer privacy.
 */
export const kitchenListOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<KitchenOrder[]> => {
    const { assertKitchen } = await import("@/lib/kitchen.server");
    await assertKitchen(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, code, status, fulfillment, created_at, delivery_notes, order_items(product_name, variant_name, quantity)",
      )
      .in("status", ["placed", "confirmed", "preparing", "ready"])
      .order("created_at", { ascending: true })
      .limit(80);

    if (error) {
      console.error("Kitchen order list failed", error);
      throw new Error("We couldn't load the kitchen queue. Please try again.");
    }

    return (data ?? []).map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      fulfillment: o.fulfillment as "delivery" | "pickup",
      createdAt: o.created_at,
      deliveryNotes: o.delivery_notes,
      items: (o.order_items ?? []).map((i) => ({
        name: i.product_name,
        variantName: i.variant_name,
        quantity: i.quantity,
      })),
    }));
  });

/**
 * Advances an order through the existing status lifecycle. Kitchen users may
 * only set kitchen-relevant statuses; owner-only actions (cancel, delivery
 * dispatch) stay in the existing owner endpoint.
 */
export const kitchenUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        status: z.enum(["confirmed", "preparing", "ready", "completed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertKitchen } = await import("@/lib/kitchen.server");
    await assertKitchen(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.orderId);

    if (error) {
      console.error("Kitchen status update failed", error);
      throw new Error("We couldn't update this order. Please try again.");
    }
    return { ok: true, status: data.status };
  });

export interface KitchenStockRow {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  lowStockThreshold: number;
  isLow: boolean;
  isOut: boolean;
  usedToday: number;
}

/**
 * Kitchen-facing read-only view of the EXISTING inventory tables. No writes,
 * no parallel inventory system — stock changes still go through the owner
 * endpoints and the existing order consumption function.
 */
export const kitchenListInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<KitchenStockRow[]> => {
    const { assertKitchen } = await import("@/lib/kitchen.server");
    await assertKitchen(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ data: rows, error }, { data: used }] = await Promise.all([
      supabaseAdmin
        .from("inventory_items")
        .select("id, name, unit, current_stock, low_stock_threshold, is_active")
        .eq("is_active", true)
        .order("name"),
      supabaseAdmin
        .from("inventory_movements")
        .select("item_id, quantity")
        .eq("change_type", "order")
        .gte("created_at", since),
    ]);

    if (error) {
      console.error("Kitchen inventory list failed", error);
      throw new Error("We couldn't load ingredient stock. Please try again.");
    }

    const usedByItem = new Map<string, number>();
    for (const m of used ?? []) {
      usedByItem.set(m.item_id, (usedByItem.get(m.item_id) ?? 0) + Number(m.quantity));
    }

    return (rows ?? []).map((r) => {
      const currentStock = Number(r.current_stock);
      const lowStockThreshold = Number(r.low_stock_threshold);
      return {
        id: r.id,
        name: r.name,
        unit: r.unit,
        currentStock,
        lowStockThreshold,
        isLow: currentStock > 0 && currentStock <= lowStockThreshold,
        isOut: currentStock <= 0,
        usedToday: usedByItem.get(r.id) ?? 0,
      };
    });
  });
