import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ReviewSettings {
  reviewsEnabled: boolean;
  photosEnabled: boolean;
}

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string;
  reviewerAvatarUrl: string | null;
  photoUrl: string | null;
  videoUrl: string | null;
  verifiedOrder: boolean;
}

export interface ProductReviewSummary {
  average: number;
  count: number;
  reviews: PublicReview[];
}

export interface MyReview {
  id: string;
  rating: number;
  comment: string | null;
  photoPath: string | null;
  photoUrl: string | null;
  videoPath: string | null;
  videoUrl: string | null;
  productId: string | null;
  status: string;
  createdAt: string;
}

export interface ReviewableOrder {
  id: string;
  code: string;
  status: string;
  createdAt: string;
  items: { productId: string; productName: string }[];
}

/** Only the first name is ever shown publicly — never phone, address or ids. */
function publicName(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  return first.length > 0 ? first : "Flamio customer";
}

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  photo_path: string | null;
  video_path?: string | null;
  created_at: string;
  user_id: string | null;
  guest_name?: string | null;
  order_id?: string | null;
  product_id?: string | null;
  orders?: { code: string } | null;
  products?: { name: string } | null;
};

type ProfileRow = { id: string; full_name: string | null; avatar_path?: string | null };

function loose(client: unknown) {
  // New review columns live in external Supabase migrations and can lag behind generated types.
  return client as any;
}

async function signedUrlMap(client: unknown, bucket: string, paths: string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;
  const { data } = await loose(client).storage.from(bucket).createSignedUrls(paths, 60 * 60);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

async function profileMap(client: unknown, userIds: string[]): Promise<Map<string, ProfileRow>> {
  if (userIds.length === 0) return new Map();
  const { data } = await loose(client)
    .from("profiles")
    .select("id, full_name, avatar_path")
    .in("id", userIds);
  return new Map((data ?? []).map((p: ProfileRow) => [p.id, p]));
}

function reviewName(row: ReviewRow, profiles: Map<string, ProfileRow>): string {
  if (row.user_id) return publicName(profiles.get(row.user_id)?.full_name ?? row.guest_name);
  return publicName(row.guest_name);
}

function pathBelongsTo(path: string | null, userId: string, label: string): string | null {
  if (!path) return null;
  if (!path.startsWith(`${userId}/`)) throw new Error(`${label} doesn't belong to your account.`);
  return path;
}

/**
 * Reviews on/off and photos on/off, from the existing restaurant settings row.
 * Public because the product page needs it before sign-in.
 */
export const getReviewSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReviewSettings> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("restaurant_settings")
      .select("reviews_enabled, review_photos_enabled")
      .limit(1)
      .maybeSingle();
    return {
      reviewsEnabled: data?.reviews_enabled !== false,
      photosEnabled: data?.review_photos_enabled !== false,
    };
  },
);

/**
 * Approved reviews for one dish. Read with the service client so the response
 * can be reduced to safe fields only (rating, text, first name, photo) — the
 * reviewer's account id, phone and address never leave the server.
 */
export const listProductReviews = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ productId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<ProductReviewSummary> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: settings }, { data: rows, error }] = await Promise.all([
      supabaseAdmin.from("restaurant_settings").select("reviews_enabled, review_photos_enabled").limit(1).maybeSingle(),
      loose(supabaseAdmin)
        .from("order_reviews")
        .select("id, rating, comment, photo_path, video_path, created_at, user_id, guest_name, order_id")
        .eq("product_id", data.productId)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    if (error || settings?.reviews_enabled === false) {
      if (error) console.error("Product reviews lookup failed", error);
      return { average: 0, count: 0, reviews: [] };
    }

    const reviews = rows ?? [];
    if (reviews.length === 0) return { average: 0, count: 0, reviews: [] };

    const userIds = [...new Set(reviews.map((r: ReviewRow) => r.user_id).filter((id: string | null): id is string => Boolean(id)))];
    const profiles = await profileMap(supabaseAdmin, userIds);

    const photosOn = settings?.review_photos_enabled !== false;
    const paths = photosOn
      ? reviews.map((r: ReviewRow) => r.photo_path).filter((p: string | null): p is string => Boolean(p))
      : [];
    const videoPaths = reviews.map((r: ReviewRow) => r.video_path).filter((p: string | null | undefined): p is string => Boolean(p));
    const avatarPaths = [...new Set([...profiles.values()].map((p) => p.avatar_path).filter((p): p is string => Boolean(p)))];
    const [signed, signedVideos, signedAvatars] = await Promise.all([
      signedUrlMap(supabaseAdmin, "review-photos", paths),
      signedUrlMap(supabaseAdmin, "review-photos", videoPaths),
      signedUrlMap(supabaseAdmin, "profile-photos", avatarPaths),
    ]);

    const total = reviews.reduce((sum: number, r: ReviewRow) => sum + r.rating, 0);
    return {
      average: Math.round((total / reviews.length) * 10) / 10,
      count: reviews.length,
      reviews: reviews.map((r: ReviewRow) => {
        const profile = r.user_id ? profiles.get(r.user_id) : undefined;
        return {
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.created_at,
        reviewerName: reviewName(r, profiles),
        reviewerAvatarUrl: profile?.avatar_path ? (signedAvatars.get(profile.avatar_path) ?? null) : null,
        photoUrl: r.photo_path ? (signed.get(r.photo_path) ?? null) : null,
        videoUrl: r.video_path ? (signedVideos.get(r.video_path) ?? null) : null,
        verifiedOrder: Boolean(r.order_id),
      };
      }),
    };
  });

/** Approved customer reviews for the bottom-of-page public review section. */
export const listPublicReviews = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProductReviewSummary> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: settings }, { data: rows, error }] = await Promise.all([
      supabaseAdmin.from("restaurant_settings").select("reviews_enabled, review_photos_enabled").limit(1).maybeSingle(),
      loose(supabaseAdmin)
        .from("order_reviews")
        .select("id, rating, comment, photo_path, video_path, created_at, user_id, guest_name, order_id")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    if (error || settings?.reviews_enabled === false) {
      if (error) console.error("Public reviews lookup failed", error);
      return { average: 0, count: 0, reviews: [] };
    }

    const reviews: ReviewRow[] = rows ?? [];
    if (reviews.length === 0) return { average: 0, count: 0, reviews: [] };

    const userIds = [...new Set(reviews.map((r) => r.user_id).filter((id): id is string => Boolean(id)))];
    const profiles = await profileMap(supabaseAdmin, userIds);
    const photosOn = settings?.review_photos_enabled !== false;
    const photoPaths = photosOn
      ? reviews.map((r) => r.photo_path).filter((p): p is string => Boolean(p))
      : [];
    const videoPaths = reviews.map((r) => r.video_path).filter((p): p is string => Boolean(p));
    const avatarPaths = [...new Set([...profiles.values()].map((p) => p.avatar_path).filter((p): p is string => Boolean(p)))];

    const [photoUrls, videoUrls, avatarUrls] = await Promise.all([
      signedUrlMap(supabaseAdmin, "review-photos", photoPaths),
      signedUrlMap(supabaseAdmin, "review-photos", videoPaths),
      signedUrlMap(supabaseAdmin, "profile-photos", avatarPaths),
    ]);

    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return {
      average: Math.round((total / reviews.length) * 10) / 10,
      count: reviews.length,
      reviews: reviews.map((review) => {
        const profile = review.user_id ? profiles.get(review.user_id) : undefined;
        return {
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.created_at,
          reviewerName: reviewName(review, profiles),
          reviewerAvatarUrl: profile?.avatar_path ? (avatarUrls.get(profile.avatar_path) ?? null) : null,
          photoUrl: review.photo_path ? (photoUrls.get(review.photo_path) ?? null) : null,
          videoUrl: review.video_path ? (videoUrls.get(review.video_path) ?? null) : null,
          verifiedOrder: Boolean(review.order_id),
        };
      }),
    };
  },
);

/** General customer review, with no order required. Guest reviews are accepted without media. */
export const submitGeneralReview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        guestName: z.string().trim().max(80).nullable(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().min(2).max(1000),
        photoPath: z.string().trim().max(300).nullable(),
        videoPath: z.string().trim().max(300).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getOptionalUserId } = await import("@/lib/auth.server");
    const userId = await getOptionalUserId();

    const { data: settings } = await supabaseAdmin
      .from("restaurant_settings")
      .select("reviews_enabled, review_photos_enabled")
      .limit(1)
      .maybeSingle();
    if (settings?.reviews_enabled === false) {
      throw new Error("Reviews are turned off right now.");
    }

    const guestName = data.guestName?.trim() || null;
    if (!userId && !guestName) throw new Error("Please add your name before sending your review.");

    const photoPath = userId && settings?.review_photos_enabled !== false
      ? pathBelongsTo(data.photoPath, userId, "That photo")
      : null;
    const videoPath = userId ? pathBelongsTo(data.videoPath, userId, "That video") : null;

    const { error } = await loose(supabaseAdmin).from("order_reviews").insert({
      order_id: null,
      user_id: userId,
      product_id: null,
      rating: data.rating,
      comment: data.comment,
      guest_name: guestName,
      photo_path: photoPath,
      video_path: videoPath,
      status: "pending",
    });
    if (error) {
      console.error("General review insert failed", error);
      throw new Error("We couldn't save your review. Please try again.");
    }
    return { ok: true };
  });

/**
 * The order the customer wants to review plus their existing review, if any.
 * Row-level security guarantees a customer can only ever load their own order.
 */
export const getOrderReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(
    async ({ data, context }): Promise<{ order: ReviewableOrder | null; review: MyReview | null }> => {
      const { data: order } = await context.supabase
        .from("orders")
        .select("id, code, status, created_at, order_items(product_id, product_name)")
        .eq("id", data.orderId)
        .eq("user_id", context.userId)
        .maybeSingle();

      if (!order) return { order: null, review: null };

      const { data: review } = await loose(context.supabase)
        .from("order_reviews")
        .select("id, rating, comment, photo_path, video_path, product_id, status, created_at")
        .eq("order_id", data.orderId)
        .eq("user_id", context.userId)
        .maybeSingle();

      let photoUrl: string | null = null;
      if (review?.photo_path) {
        const { data: signed } = await context.supabase.storage
          .from("review-photos")
          .createSignedUrl(review.photo_path, 60 * 60);
        photoUrl = signed?.signedUrl ?? null;
      }

      let videoUrl: string | null = null;
      if (review?.video_path) {
        const { data: signed } = await context.supabase.storage
          .from("review-photos")
          .createSignedUrl(review.video_path, 60 * 60);
        videoUrl = signed?.signedUrl ?? null;
      }

      const seen = new Set<string>();
      const items: ReviewableOrder["items"] = [];
      for (const item of order.order_items ?? []) {
        if (seen.has(item.product_id)) continue;
        seen.add(item.product_id);
        items.push({ productId: item.product_id, productName: item.product_name });
      }

      return {
        order: {
          id: order.id,
          code: order.code,
          status: order.status,
          createdAt: order.created_at,
          items,
        },
        review: review
          ? {
              id: review.id,
              rating: review.rating,
              comment: review.comment,
              photoPath: review.photo_path,
              photoUrl,
              videoPath: review.video_path ?? null,
              videoUrl,
              productId: review.product_id,
              status: review.status,
              createdAt: review.created_at,
            }
          : null,
      };
    },
  );

/**
 * Saves (or updates) the customer's review for one of their own completed
 * orders. Every rule is checked server-side: ownership, order status, one
 * review per order, and that a photo path belongs to this customer's folder.
 */
export const submitReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        productId: z.string().uuid().nullable(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(1000).nullable(),
        photoPath: z.string().trim().max(300).nullable(),
        videoPath: z.string().trim().max(300).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("restaurant_settings")
      .select("reviews_enabled, review_photos_enabled")
      .limit(1)
      .maybeSingle();
    if (settings?.reviews_enabled === false) {
      throw new Error("Reviews are turned off right now.");
    }

    // Ownership and status are verified against the customer's own order.
    const { data: order } = await context.supabase
      .from("orders")
      .select("id, status")
      .eq("id", data.orderId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!order) throw new Error("We couldn't find that order.");
    if (order.status !== "completed") {
      throw new Error("You can review this order once it's completed.");
    }

    let photoPath = data.photoPath;
    if (photoPath) {
      if (settings?.review_photos_enabled === false) {
        photoPath = null;
      } else {
        photoPath = pathBelongsTo(photoPath, context.userId, "That photo");
      }
    }

    const videoPath = pathBelongsTo(data.videoPath, context.userId, "That video");

    // The order line must really contain the dish being reviewed.
    if (data.productId) {
      const { data: line } = await context.supabase
        .from("order_items")
        .select("id")
        .eq("order_id", data.orderId)
        .eq("product_id", data.productId)
        .limit(1)
        .maybeSingle();
      if (!line) throw new Error("That dish isn't part of this order.");
    }

    const { data: existing } = await loose(context.supabase)
      .from("order_reviews")
      .select("id, photo_path, video_path")
      .eq("order_id", data.orderId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await loose(context.supabase)
        .from("order_reviews")
        .update({
          rating: data.rating,
          comment: data.comment,
          product_id: data.productId,
          photo_path: photoPath,
          video_path: videoPath,
          // An edited review goes back for approval.
          status: "pending",
        })
        .eq("id", existing.id);
      if (error) {
        console.error("Review update failed", error);
        throw new Error("We couldn't save your review. Please try again.");
      }
      if (existing.photo_path && existing.photo_path !== photoPath) {
        await context.supabase.storage.from("review-photos").remove([existing.photo_path]);
      }
      if (existing.video_path && existing.video_path !== videoPath) {
        await context.supabase.storage.from("review-photos").remove([existing.video_path]);
      }
      return { ok: true, updated: true };
    }

    const { error } = await loose(context.supabase).from("order_reviews").insert({
      order_id: data.orderId,
      user_id: context.userId,
      product_id: data.productId,
      rating: data.rating,
      comment: data.comment,
      photo_path: photoPath,
      video_path: videoPath,
    });
    if (error) {
      console.error("Review insert failed", error);
      // 23505 = the unique (order, customer) guard already holds a review.
      if (error.code === "23505") throw new Error("You've already reviewed this order.");
      throw new Error("We couldn't save your review. Please try again.");
    }
    return { ok: true, updated: false };
  });

export interface OwnerReview {
  id: string;
  rating: number;
  comment: string | null;
  status: string;
  createdAt: string;
  orderId: string;
  orderCode: string;
  productName: string | null;
  customerName: string;
  photoUrl: string | null;
  videoUrl: string | null;
  verifiedOrder: boolean;
}

export const ownerListReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OwnerReview[]> => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "customers");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await loose(supabaseAdmin)
      .from("order_reviews")
      .select(
        "id, rating, comment, status, created_at, order_id, photo_path, video_path, user_id, guest_name, orders(code), products(name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("Owner reviews lookup failed", error);
      throw new Error("We couldn't load the reviews. Please try again.");
    }

    const rows = data ?? [];
    const userIds = [...new Set(rows.map((r: ReviewRow) => r.user_id).filter((id: string | null): id is string => Boolean(id)))];
    const profiles = await profileMap(supabaseAdmin, userIds);

    const paths = rows.map((r: ReviewRow) => r.photo_path).filter((p: string | null): p is string => Boolean(p));
    const videoPaths = rows.map((r: ReviewRow) => r.video_path).filter((p: string | null | undefined): p is string => Boolean(p));
    const [signed, signedVideos] = await Promise.all([
      signedUrlMap(supabaseAdmin, "review-photos", paths),
      signedUrlMap(supabaseAdmin, "review-photos", videoPaths),
    ]);

    return rows.map((r: ReviewRow) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      status: r.status,
      createdAt: r.created_at,
      orderId: r.order_id ?? "",
      orderCode: (r.orders as { code: string } | null)?.code ?? "",
      productName: (r.products as { name: string } | null)?.name ?? null,
      customerName: reviewName(r, profiles),
      photoUrl: r.photo_path ? (signed.get(r.photo_path) ?? null) : null,
      videoUrl: r.video_path ? (signedVideos.get(r.video_path) ?? null) : null,
      verifiedOrder: Boolean(r.order_id),
    }));
  });

export const ownerSetReviewStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "approved", "hidden"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "customers");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("order_reviews")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error("We couldn't update this review. Please try again.");
    return { ok: true };
  });

export const ownerDeleteReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "customers");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await loose(supabaseAdmin)
      .from("order_reviews")
      .select("photo_path, video_path")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("order_reviews").delete().eq("id", data.id);
    if (error) throw new Error("We couldn't remove this review. Please try again.");
    if (row?.photo_path) {
      await supabaseAdmin.storage.from("review-photos").remove([row.photo_path]);
    }
    if (row?.video_path) {
      await supabaseAdmin.storage.from("review-photos").remove([row.video_path]);
    }
    return { ok: true };
  });
