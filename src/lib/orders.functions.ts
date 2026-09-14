import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Order persistence. Orders hold customer PII, so the tables have no public
 * policies at all — every read and write goes through these server functions.
 */

const itemSchema = z.object({
  productId: z.string().min(1),
  productSlug: z.string().min(1),
  productName: z.string().min(1),
  variantId: z.string().nullable(),
  variantName: z.string().nullable(),
  unitPrice: z.number().nonnegative(),
  quantity: z.number().int().positive().max(99),
  imageUrl: z.string().nullable(),
});

const placeOrderSchema = z.object({
  fulfillment: z.enum(["delivery", "pickup"]),
  paymentMethod: z.string().min(1),
  paymentLabel: z.string().min(1),
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(6).max(20),
  addressLine: z.string().trim().max(300).nullable(),
  area: z.string().trim().max(120).nullable(),
  landmark: z.string().trim().max(160).nullable(),
  deliveryNotes: z.string().trim().max(400).nullable(),
  zoneId: z.string().nullable(),
  zoneName: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  estimatedTime: z.string().nullable(),
  pickupNote: z.string().nullable(),
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative(),
  couponCode: z.string().trim().min(2).max(40).nullable().optional(),
  deliveryCharge: z.number().nonnegative(),
  total: z.number().nonnegative(),
  items: z.array(itemSchema).min(1).max(50),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

function orderCode(date: Date): string {
  const stamp = [
    date.getUTCFullYear().toString().slice(-2),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
  const random = Math.floor(Math.random() * 46656)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0");
  return `FLM-${stamp}-${random}`;
}

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => placeOrderSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getOptionalUserId } = await import("@/lib/auth.server");

    // Signed-in customers own their orders; guests keep placing orders freely.
    const userId = await getOptionalUserId();

    // Recompute money server-side; never trust totals from the browser.
    const subtotal = data.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    // Coupons are validated and priced on the server only.
    let couponCode: string | null = null;
    let discount = Math.min(data.discount, subtotal);
    if (data.couponCode) {
      const { couponDiscountFor, loadCouponByCode } = await import("@/lib/coupons.functions");
      const coupon = await loadCouponByCode(data.couponCode);
      if (!coupon) throw new Error("That coupon code isn't valid.");
      const result = couponDiscountFor(coupon, subtotal);
      if ("error" in result) throw new Error(result.error);
      discount = result.discount;
      couponCode = coupon.code;
    }
    const isDelivery = data.fulfillment === "delivery";

    if (isDelivery && !data.addressLine) {
      throw new Error("A delivery address is required.");
    }

    // Distance-based delivery: when the owner has configured radius zones the
    // charge, zone and estimated time are recalculated here from the pinned
    // coordinates. Anything sent by the browser is ignored. With no radius
    // zones configured this block is inert and the original area-based
    // behaviour is used unchanged.
    let deliveryCharge = isDelivery ? data.deliveryCharge : 0;
    let zoneId = isDelivery ? data.zoneId : null;
    let zoneName = isDelivery ? data.zoneName : null;
    let estimatedTime = data.estimatedTime;
    let distanceM: number | null = null;
    let latitude = isDelivery ? data.latitude : null;
    let longitude = isDelivery ? data.longitude : null;

    if (isDelivery) {
      const { resolveLocationDelivery } = await import("@/lib/delivery.server");
      const located = await resolveLocationDelivery({
        latitude: data.latitude,
        longitude: data.longitude,
        subtotal,
        discount,
      });
      if (located.radiusMode) {
        if (!located.available) {
          throw new Error(located.message ?? "We can't deliver to that location.");
        }
        if (!located.meetsMinimumOrder) {
          throw new Error(`The minimum order for delivery is ${located.minimumOrder}.`);
        }
        deliveryCharge = located.charge;
        zoneId = located.zoneSlug;
        zoneName = located.zoneName;
        estimatedTime = located.estimatedTime;
        distanceM = located.distanceM;
      }
    } else {
      latitude = null;
      longitude = null;
    }

    const total = Math.max(subtotal - discount, 0) + deliveryCharge;

    let inserted: { id: string; code: string; created_at: string } | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      const { data: row, error } = await supabaseAdmin
        .from("orders")
        .insert({
          code: orderCode(new Date()),
          user_id: userId,
          status: "placed",
          fulfillment: data.fulfillment,
          payment_method: data.paymentMethod,
          payment_label: data.paymentLabel,
          customer_name: data.customerName,
          customer_phone: data.customerPhone,
          address_line: isDelivery ? data.addressLine : null,
          area: isDelivery ? data.area : null,
          landmark: isDelivery ? data.landmark : null,
          delivery_notes: data.deliveryNotes,
          zone_id: zoneId,
          zone_name: zoneName,
          latitude,
          longitude,
          distance_m: distanceM,
          estimated_time: estimatedTime,
          pickup_note: isDelivery ? null : data.pickupNote,
          subtotal,
          discount,
          delivery_charge: deliveryCharge,
          total,
          coupon_code: couponCode,
        })
        .select("id, code, created_at")
        .single();

      if (error) {
        lastError = error;
        // 23505 = duplicate order code; regenerate and retry.
        if (error.code !== "23505") break;
        continue;
      }
      inserted = row;
    }

    if (!inserted) {
      console.error("Order insert failed", lastError);
      throw new Error("We couldn't save your order. Please try again.");
    }

    const { error: itemsError } = await supabaseAdmin.from("order_items").insert(
      data.items.map((i) => ({
        order_id: inserted.id,
        product_id: i.productId,
        product_slug: i.productSlug,
        product_name: i.productName,
        variant_id: i.variantId,
        variant_name: i.variantName,
        unit_price: i.unitPrice,
        quantity: i.quantity,
        image_url: i.imageUrl,
      })),
    );

    if (itemsError) {
      console.error("Order items insert failed", itemsError);
      await supabaseAdmin.from("orders").delete().eq("id", inserted.id);
      throw new Error("We couldn't save your order items. Please try again.");
    }

    // Count the coupon once, after the order is safely stored.
    if (couponCode) {
      const { data: couponRow } = await supabaseAdmin
        .from("coupons")
        .select("id, times_used")
        .eq("code", couponCode)
        .maybeSingle();
      if (couponRow) {
        await supabaseAdmin
          .from("coupons")
          .update({ times_used: couponRow.times_used + 1 })
          .eq("id", couponRow.id);
      }
    }

    // Ingredient stock is consumed only after the order and its items are
    // safely stored. The DB function is idempotent per order, so a retry can
    // never reduce stock twice, and failures here never block the order.
    // In Simple mode the restaurant only tracks purchases, so automatic
    // deduction is skipped for new orders. Advanced mode (the default) keeps
    // the existing behaviour untouched.
    const { data: settingsRow } = await supabaseAdmin
      .from("restaurant_settings")
      .select("inventory_mode")
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (settingsRow?.inventory_mode !== "simple") {
      const { error: stockError } = await supabaseAdmin.rpc("consume_inventory_for_order", {
        _order_id: inserted.id,
      });
      if (stockError) console.error("Inventory consumption failed", stockError);
    }

    return { id: inserted.id, code: inserted.code, createdAt: inserted.created_at };
  });

export const getOrder = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ orderId: z.string().min(3) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getOptionalUserId } = await import("@/lib/auth.server");

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.orderId);

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq(isUuid ? "id" : "code", data.orderId)
      .maybeSingle();

    if (error) {
      console.error("Order lookup failed", error);
      throw new Error("We couldn't load this order. Please try again.");
    }
    if (!order) return null;

    // Orders that belong to an account are readable only by that account.
    if (order.user_id) {
      const callerId = await getOptionalUserId();
      if (callerId !== order.user_id) return null;
    }

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("*")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });

    return {
      id: order.id,
      code: order.code,
      status: order.status,
      userId: order.user_id,
      createdAt: order.created_at,
      fulfillment: order.fulfillment as "delivery" | "pickup",
      paymentMethod: order.payment_method,
      paymentLabel: order.payment_label,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      addressLine: order.address_line,
      area: order.area,
      landmark: order.landmark,
      deliveryNotes: order.delivery_notes,
      zoneName: order.zone_name,
      estimatedTime: order.estimated_time,
      pickupNote: order.pickup_note,
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      deliveryCharge: Number(order.delivery_charge),
      total: Number(order.total),
      items: (items ?? []).map((i) => ({
        lineId: i.id,
        productId: i.product_id,
        productSlug: i.product_slug,
        productName: i.product_name,
        variantId: i.variant_id,
        variantName: i.variant_name,
        unitPrice: Number(i.unit_price),
        quantity: i.quantity,
        imageUrl: i.image_url,
      })),
    };
  });
