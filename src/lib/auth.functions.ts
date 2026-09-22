import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";
import { normalizePhone } from "@/lib/phone";

type LoginResult =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; message: string };

function publicAuthClient() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/**
 * Compatibility login for accounts whose real auth email differs from the
 * phone stored in their profile. It never returns the mapped email or logs the
 * password; the existing auth provider still validates the credentials.
 */
export const signInWithPhonePassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ phone: z.string().trim().min(6).max(24), password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }): Promise<LoginResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const phone = normalizePhone(data.phone);
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .limit(2);

    if (error || profiles?.length !== 1) {
      return { ok: false, message: "Incorrect email/phone or password." };
    }

    const profile = profiles[0];
    if (!profile) return { ok: false, message: "Incorrect email/phone or password." };

    const { data: authUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    const email = authUser.user?.email;
    if (userError || !email) return { ok: false, message: "Incorrect email/phone or password." };

    const { data: signedIn, error: signInError } = await publicAuthClient().auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (signInError || !signedIn.session) {
      return { ok: false, message: "Incorrect email/phone or password." };
    }

    return {
      ok: true,
      accessToken: signedIn.session.access_token,
      refreshToken: signedIn.session.refresh_token,
    };
  });