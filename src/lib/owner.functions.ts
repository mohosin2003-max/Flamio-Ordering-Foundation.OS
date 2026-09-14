import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Owner / admin management endpoints. Every handler re-checks the caller's
 * role server-side (`assertOwner`) before touching data with the service-role
 * client — route protection in the UI is convenience only.
 *
 * These reuse the EXISTING tables (categories, products, product_images,
 * orders) and the existing order status lifecycle. Nothing is duplicated.
 */

export interface OwnerOrderRow {
  id: string;
  code: string;
  status: string;
  fulfillment: "delivery" | "pickup";
  customerName: string;
  customerPhone: string;
  total: number;
  createdAt: string;
  addressLine: string | null;
  area: string | null;
  paymentLabel: string;
  riderId: string | null;
  riderName: string | null;
}

export interface OwnerCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isVisible: boolean;
  sortOrder: number;
  productCount: number;
}

export interface OwnerProduct {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  description: string | null;
  basePrice: number;
  isAvailable: boolean;
  isFeatured: boolean;
  isPopular: boolean;
  sortOrder: number;
  imageUrl: string | null;
}

export interface RestaurantSettings {
  id: string;
  name: string;
  tagline: string | null;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  country: string | null;
  isOpen: boolean;
  inventoryMode: "simple" | "advanced";
  opensAt: string | null;
  closesAt: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  googleMapsUrl: string | null;
}

/**
 * What can the caller open in the dashboard? Owners/managers are unrestricted;
 * staff get exactly the permissions switched on for them. Also reports whether
 * ownership is unclaimed.
 */
export const getOwnerAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getAccessProfile } = await import("@/lib/owner.server");

    const [{ data: mine }, access] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId),
      getAccessProfile(context.userId),
    ]);

    const roles = (mine ?? []).map((r) => r.role as string);

    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "owner");

    const hasAccess = access.isManager || access.permissions.length > 0;

    return {
      isOwner: hasAccess,
      isManager: access.isManager,
      isStaff: access.isStaff,
      permissions: access.permissions as string[],
      roles,
      canClaim: !hasAccess && (count ?? 0) === 0,
    };
  });

/** First-run bootstrap: the first signed-in user may claim ownership once. */
export const claimOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "owner");

    if ((count ?? 0) > 0) throw new Error("Ownership has already been claimed.");

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "owner" });

    if (error) {
      console.error("Claim ownership failed", error);
      throw new Error("We couldn't set up owner access. Please try again.");
    }
    return { ok: true };
  });

export const ownerListOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OwnerOrderRow[]> => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "online_orders");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, code, status, fulfillment, customer_name, customer_phone, total, created_at, address_line, area, payment_label, rider_id, riders(name)",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Owner order list failed", error);
      throw new Error("We couldn't load orders. Please try again.");
    }

    return (data ?? []).map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      fulfillment: o.fulfillment as "delivery" | "pickup",
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      total: Number(o.total),
      createdAt: o.created_at,
      addressLine: o.address_line,
      area: o.area,
      paymentLabel: o.payment_label,
      riderId: o.rider_id,
      riderName: o.riders?.name ?? null,
    }));
  });

/** Updates the status on the existing orders table — DB triggers still fire. */
export const ownerUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        status: z.enum([
          "placed",
          "confirmed",
          "preparing",
          "ready",
          "out_for_delivery",
          "completed",
          "cancelled",
        ]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "order_management");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.orderId);

    if (error) {
      console.error("Owner status update failed", error);
      throw new Error("We couldn't update this order. Please try again.");
    }
    return { ok: true, status: data.status };
  });

/** Full catalog including hidden categories and unavailable items. */
export const ownerGetCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ categories: OwnerCategory[]; products: OwnerProduct[] }> => {
      const { assertAnyPermission } = await import("@/lib/owner.server");
      await assertAnyPermission(context.userId, ["menu", "pos"]);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const [{ data: categories }, { data: products }, { data: images }] = await Promise.all([
        supabaseAdmin
          .from("categories")
          .select("id, slug, name, description, image_url, is_visible, sort_order")
          .order("sort_order"),
        supabaseAdmin
          .from("products")
          .select(
            "id, category_id, slug, name, description, base_price, is_available, is_featured, is_popular, sort_order",
          )
          .order("sort_order"),
        supabaseAdmin
          .from("product_images")
          .select("product_id, url, is_primary, sort_order")
          .order("sort_order"),
      ]);

      const imageByProduct = new Map<string, string | null>();
      for (const img of images ?? []) {
        if (!imageByProduct.has(img.product_id) || img.is_primary) {
          imageByProduct.set(img.product_id, img.url);
        }
      }

      const counts = new Map<string, number>();
      for (const p of products ?? []) {
        counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
      }

      return {
        categories: (categories ?? []).map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          description: c.description,
          imageUrl: c.image_url,
          isVisible: c.is_visible,
          sortOrder: c.sort_order,
          productCount: counts.get(c.id) ?? 0,
        })),
        products: (products ?? []).map((p) => ({
          id: p.id,
          categoryId: p.category_id,
          slug: p.slug,
          name: p.name,
          description: p.description,
          basePrice: Number(p.base_price),
          isAvailable: p.is_available,
          isFeatured: p.is_featured,
          isPopular: p.is_popular,
          sortOrder: p.sort_order,
          imageUrl: imageByProduct.get(p.id) ?? null,
        })),
      };
    },
  );

export const ownerSaveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        name: z.string().trim().min(2).max(60),
        slug: z
          .string()
          .trim()
          .min(2)
          .max(60)
          .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes only."),
        description: z.string().trim().max(300).nullable(),
        imageUrl: z.string().trim().url().max(500).nullable(),
        isVisible: z.boolean(),
        sortOrder: z.number().int().min(0).max(999),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "menu");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const row = {
      name: data.name,
      slug: data.slug,
      description: data.description,
      image_url: data.imageUrl,
      is_visible: data.isVisible,
      sort_order: data.sortOrder,
    };

    const query = data.id
      ? supabaseAdmin.from("categories").update(row).eq("id", data.id)
      : supabaseAdmin.from("categories").insert(row);

    const { error } = await query;
    if (error) {
      console.error("Save category failed", error);
      throw new Error(
        error.code === "23505"
          ? "Another category already uses that link (slug)."
          : "We couldn't save this category. Please try again.",
      );
    }
    return { ok: true };
  });

/**
 * Deletes a category. Items are never deleted silently: the caller must either
 * empty the category first or pass `reassignTo` so its items are moved.
 */
export const ownerDeleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reassignTo: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "menu");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count } = await supabaseAdmin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("category_id", data.id);

    if ((count ?? 0) > 0) {
      if (!data.reassignTo) {
        throw new Error("Choose a category to move this category's items into first.");
      }
      if (data.reassignTo === data.id) {
        throw new Error("Pick a different category to move the items into.");
      }

      const { data: target } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("id", data.reassignTo)
        .maybeSingle();
      if (!target) throw new Error("That destination category no longer exists.");

      const { error: moveError } = await supabaseAdmin
        .from("products")
        .update({ category_id: data.reassignTo })
        .eq("category_id", data.id);

      if (moveError) {
        console.error("Reassign products failed", moveError);
        throw new Error("We couldn't move this category's items. Nothing was deleted.");
      }
    }

    const { error } = await supabaseAdmin.from("categories").delete().eq("id", data.id);
    if (error) {
      console.error("Delete category failed", error);
      throw new Error("We couldn't delete this category. Please try again.");
    }
    return { ok: true, moved: count ?? 0 };
  });


export const ownerSaveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        categoryId: z.string().uuid(),
        name: z.string().trim().min(2).max(80),
        slug: z
          .string()
          .trim()
          .min(2)
          .max(80)
          .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes only."),
        description: z.string().trim().max(500).nullable(),
        basePrice: z.number().nonnegative().max(1000000),
        isAvailable: z.boolean(),
        isFeatured: z.boolean(),
        isPopular: z.boolean(),
        sortOrder: z.number().int().min(0).max(999),
        imageUrl: z.string().trim().url().max(500).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "menu");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const row = {
      category_id: data.categoryId,
      name: data.name,
      slug: data.slug,
      description: data.description,
      base_price: data.basePrice,
      is_available: data.isAvailable,
      is_featured: data.isFeatured,
      is_popular: data.isPopular,
      sort_order: data.sortOrder,
    };

    let productId = data.id ?? null;

    if (productId) {
      const { error } = await supabaseAdmin.from("products").update(row).eq("id", productId);
      if (error) {
        console.error("Update product failed", error);
        throw new Error(
          error.code === "23505"
            ? "Another item already uses that link (slug)."
            : "We couldn't save this item. Please try again.",
        );
      }
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("products")
        .insert(row)
        .select("id")
        .single();
      if (error || !inserted) {
        console.error("Insert product failed", error);
        throw new Error(
          error?.code === "23505"
            ? "Another item already uses that link (slug)."
            : "We couldn't save this item. Please try again.",
        );
      }
      productId = inserted.id;
    }

    // One primary image row per product (the customer app falls back to the
    // bundled category placeholder while `url` is null).
    const { data: existingImage } = await supabaseAdmin
      .from("product_images")
      .select("id")
      .eq("product_id", productId)
      .order("sort_order")
      .limit(1)
      .maybeSingle();

    if (existingImage) {
      await supabaseAdmin
        .from("product_images")
        .update({ url: data.imageUrl, alt: data.name })
        .eq("id", existingImage.id);
    } else {
      await supabaseAdmin
        .from("product_images")
        .insert({ product_id: productId, url: data.imageUrl, alt: data.name, is_primary: true });
    }

    return { ok: true, id: productId };
  });

export const ownerSetProductAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), isAvailable: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "menu");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("products")
      .update({ is_available: data.isAvailable })
      .eq("id", data.id);

    if (error) {
      console.error("Availability update failed", error);
      throw new Error("We couldn't update availability. Please try again.");
    }
    return { ok: true };
  });

export const ownerDeleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "menu");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("products").delete().eq("id", data.id);
    if (error) {
      console.error("Delete product failed", error);
      throw new Error("We couldn't delete this item. Please try again.");
    }
    return { ok: true };
  });

export const ownerGetSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RestaurantSettings | null> => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "settings");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data } = await supabaseAdmin
      .from("restaurant_settings")
      .select(
        "id, name, tagline, phone, email, address_line, city, country, is_open, inventory_mode, opens_at, closes_at, facebook_url, instagram_url, google_maps_url",
      )
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      tagline: data.tagline,
      phone: data.phone,
      email: data.email,
      addressLine: data.address_line,
      city: data.city,
      country: data.country,
      isOpen: data.is_open,
      inventoryMode: (data.inventory_mode === "simple" ? "simple" : "advanced") as
        | "simple"
        | "advanced",
      opensAt: data.opens_at,
      closesAt: data.closes_at,
      facebookUrl: data.facebook_url,
      instagramUrl: data.instagram_url,
      googleMapsUrl: data.google_maps_url,
    };
  });

export const ownerUpdateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(80),
        tagline: z.string().trim().max(160).nullable(),
        phone: z.string().trim().max(30).nullable(),
        email: z.string().trim().max(120).nullable(),
        addressLine: z.string().trim().max(200).nullable(),
        city: z.string().trim().max(80).nullable(),
        country: z.string().trim().max(80).nullable(),
        isOpen: z.boolean(),
        inventoryMode: z.enum(["simple", "advanced"]),
        opensAt: z.string().trim().max(30).nullable(),
        closesAt: z.string().trim().max(30).nullable(),
        facebookUrl: z.string().trim().max(300).nullable(),
        instagramUrl: z.string().trim().max(300).nullable(),
        googleMapsUrl: z.string().trim().max(500).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "settings");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("restaurant_settings")
      .update({
        name: data.name,
        tagline: data.tagline,
        phone: data.phone,
        email: data.email,
        address_line: data.addressLine,
        city: data.city,
        country: data.country,
        is_open: data.isOpen,
        inventory_mode: data.inventoryMode,
        opens_at: data.opensAt,
        closes_at: data.closesAt,
        facebook_url: data.facebookUrl,
        instagram_url: data.instagramUrl,
        google_maps_url: data.googleMapsUrl,
      })
      .eq("id", data.id);

    if (error) {
      console.error("Settings update failed", error);
      throw new Error("We couldn't save settings. Please try again.");
    }
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Product variants (sizes / options) — reuses the existing            */
/* public.product_variants table. No new storage.                      */
/* ------------------------------------------------------------------ */

export type OwnerVariant = {
  id: string;
  productId: string;
  name: string;
  price: number;
  isAvailable: boolean;
  sortOrder: number;
};

export const ownerListVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ productId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<OwnerVariant[]> => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "menu");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("product_variants")
      .select("id, product_id, name, price, is_available, sort_order")
      .eq("product_id", data.productId)
      .order("sort_order");

    if (error) {
      console.error("List variants failed", error);
      throw new Error("We couldn't load the options for this item.");
    }

    return (rows ?? []).map((v) => ({
      id: v.id,
      productId: v.product_id,
      name: v.name,
      price: Number(v.price),
      isAvailable: v.is_available,
      sortOrder: v.sort_order,
    }));
  });

export const ownerSaveVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        productId: z.string().uuid(),
        name: z.string().trim().min(1).max(60),
        price: z.number().nonnegative().max(1000000),
        isAvailable: z.boolean(),
        sortOrder: z.number().int().min(0).max(999),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "menu");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const row = {
      product_id: data.productId,
      name: data.name,
      price: data.price,
      is_available: data.isAvailable,
      sort_order: data.sortOrder,
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("product_variants")
        .update(row)
        .eq("id", data.id);
      if (error) {
        console.error("Update variant failed", error);
        throw new Error("We couldn't save this option. Please try again.");
      }
      return { ok: true, id: data.id };
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("product_variants")
      .insert(row)
      .select("id")
      .single();
    if (error || !inserted) {
      console.error("Insert variant failed", error);
      throw new Error("We couldn't add this option. Please try again.");
    }
    return { ok: true, id: inserted.id };
  });

export const ownerDeleteVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "menu");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("product_variants").delete().eq("id", data.id);
    if (error) {
      console.error("Delete variant failed", error);
      throw new Error("We couldn't delete this option. Please try again.");
    }
    return { ok: true };
  });
