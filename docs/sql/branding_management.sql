-- Flamio — Global Brand Logo & Branding Management
-- SAFE, ADDITIVE, MANUAL MIGRATION ONLY. Copy the ENTIRE file as-is; do not type anything before line 1.
-- Adds nullable brand columns + CHECK constraints to public.restaurant_settings. No deletes, no RLS/storage changes.

ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS brand_primary_logo_path text,
  ADD COLUMN IF NOT EXISTS brand_icon_logo_path text,
  ADD COLUMN IF NOT EXISTS brand_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS brand_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand_updated_at timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'restaurant_settings_brand_primary_logo_path_check'
      AND conrelid = 'public.restaurant_settings'::regclass
  ) THEN
    ALTER TABLE public.restaurant_settings
      ADD CONSTRAINT restaurant_settings_brand_primary_logo_path_check
      CHECK (
        brand_primary_logo_path IS NULL
        OR brand_primary_logo_path ~ '^brand/primary/[0-9]{10,}-[0-9a-f-]+\.webp$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'restaurant_settings_brand_icon_logo_path_check'
      AND conrelid = 'public.restaurant_settings'::regclass
  ) THEN
    ALTER TABLE public.restaurant_settings
      ADD CONSTRAINT restaurant_settings_brand_icon_logo_path_check
      CHECK (
        brand_icon_logo_path IS NULL
        OR brand_icon_logo_path ~ '^brand/icon/[0-9]{10,}-[0-9a-f-]+\.webp$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'restaurant_settings_brand_version_positive_check'
      AND conrelid = 'public.restaurant_settings'::regclass
  ) THEN
    ALTER TABLE public.restaurant_settings
      ADD CONSTRAINT restaurant_settings_brand_version_positive_check
      CHECK (brand_version >= 1);
  END IF;
END $$;

COMMENT ON COLUMN public.restaurant_settings.brand_primary_logo_path IS
  'Private storage path for the active primary brand logo in banner-images/brand/primary. Served through signed URLs only.';
COMMENT ON COLUMN public.restaurant_settings.brand_icon_logo_path IS
  'Private storage path for the active compact app icon in banner-images/brand/icon. Served through signed URLs only.';
COMMENT ON COLUMN public.restaurant_settings.brand_version IS
  'Monotonic owner-controlled brand asset version used for cache refresh.';
COMMENT ON COLUMN public.restaurant_settings.brand_updated_by IS
  'Owner user id that last activated brand logo paths.';
COMMENT ON COLUMN public.restaurant_settings.brand_updated_at IS
  'Timestamp when owner last activated brand logo paths.';

-- RLS safety:
--   Existing restaurant_settings RLS remains unchanged.
--   The table is already publicly readable for restaurant display settings.
--   Browser writes are still not allowed by policy; app writes use existing
--   server-side owner verification before updating these columns.
--
-- Storage safety:
--   No bucket or storage policy change is required. The app creates signed
--   upload targets only after verifying the caller has the real owner role.
--   The existing banner-images bucket remains private.
--
-- Functions/triggers/indexes:
--   No new function, trigger, or index is created. The existing
--   update_restaurant_settings_updated_at trigger continues to maintain
--   restaurant_settings.updated_at.

COMMIT;
