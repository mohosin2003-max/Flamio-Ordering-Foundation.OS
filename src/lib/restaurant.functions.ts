import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export interface PublicRestaurantInfo {
  name: string;
  tagline: string | null;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  country: string | null;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  googleMapsUrl: string | null;
}

/** Public, read-only restaurant profile for customer pages. Never throws —
 * returns null on failure so callers can fall back to bundled defaults. */
export const getPublicRestaurantInfo = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicRestaurantInfo | null> => {
    const supabasePublic = createClient<Database>(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );

    const { data, error } = await supabasePublic
      .from("restaurant_settings")
      .select(
        "name, tagline, phone, email, address_line, city, country, is_open, opens_at, closes_at, facebook_url, instagram_url, google_maps_url",
      )
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error("Public restaurant info load failed", error);
      return null;
    }

    return {
      name: data.name,
      tagline: data.tagline,
      phone: data.phone,
      email: data.email,
      addressLine: data.address_line,
      city: data.city,
      country: data.country,
      isOpen: data.is_open,
      opensAt: data.opens_at,
      closesAt: data.closes_at,
      facebookUrl: data.facebook_url,
      instagramUrl: data.instagram_url,
      googleMapsUrl: data.google_maps_url,
    };
  },
);
