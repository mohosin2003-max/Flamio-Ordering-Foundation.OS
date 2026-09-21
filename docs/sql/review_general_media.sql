-- Flamio customer reviews — SIGNED-IN customers only (no guest/anonymous reviews).
-- Run this in the external Supabase project's SQL Editor. Existing order-linked
-- reviews and their moderation status are preserved untouched.
--
-- NOTE: supabase/migrations/20260921174000_review_general_media.sql is an older
-- draft that still contained guest support and cannot be edited from here.
-- This file is the authoritative SQL to apply.

ALTER TABLE public.order_reviews
  ALTER COLUMN order_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS video_path text;

-- Guest-only column is no longer used; drop it only if an earlier run added it.
ALTER TABLE public.order_reviews
  DROP COLUMN IF EXISTS guest_name;

ALTER TABLE public.order_reviews
  DROP CONSTRAINT IF EXISTS order_reviews_order_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS order_reviews_order_user_unique
ON public.order_reviews (order_id, user_id)
WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_reviews_status_created_idx
ON public.order_reviews (status, created_at DESC);

DROP INDEX IF EXISTS public.order_reviews_guest_status_idx;

CREATE INDEX IF NOT EXISTS order_reviews_general_status_idx
ON public.order_reviews (status)
WHERE order_id IS NULL;

ALTER TABLE public.order_reviews
  DROP CONSTRAINT IF EXISTS order_reviews_order_or_general_check;

-- Every review must belong to a signed-in customer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'order_reviews_reviewer_required_check'
      AND conrelid = 'public.order_reviews'::regclass
  ) THEN
    ALTER TABLE public.order_reviews
      ADD CONSTRAINT order_reviews_reviewer_required_check
      CHECK (user_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_reviews TO authenticated;
GRANT ALL ON public.order_reviews TO service_role;

DROP POLICY IF EXISTS "Customers can review their own completed orders" ON public.order_reviews;
DROP POLICY IF EXISTS "Customers can review completed orders or general visits" ON public.order_reviews;

CREATE POLICY "Customers can review completed orders or general visits"
ON public.order_reviews FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (photo_path IS NULL OR photo_path LIKE auth.uid()::text || '/%')
  AND (video_path IS NULL OR video_path LIKE auth.uid()::text || '/%')
  AND (
    order_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_reviews.order_id
        AND o.user_id = auth.uid()
        AND o.status = 'completed'
    )
  )
);

DROP POLICY IF EXISTS "Customers can edit their own review" ON public.order_reviews;

CREATE POLICY "Customers can edit their own review"
ON public.order_reviews FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'
  AND (photo_path IS NULL OR photo_path LIKE auth.uid()::text || '/%')
  AND (video_path IS NULL OR video_path LIKE auth.uid()::text || '/%')
);

-- Storage: private bucket `review-photos` (5 MB limit) with own-folder
-- upload/select/delete for authenticated customers and team select via
-- public.has_role('owner'|'admin'|'staff').
