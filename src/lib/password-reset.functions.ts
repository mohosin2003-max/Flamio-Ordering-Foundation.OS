import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { formatPhone, isValidPhone, normalizePhone } from "@/lib/phone";

/**
 * Password reset preparation.
 *
 * Accounts are created with a derived auth email, so the auth record may not
 * carry the customer's phone number yet. Before a REAL SMS OTP can be
 * delivered to that account we attach the (already verified-by-ownership)
 * phone number to the auth user. No OTP is generated here — delivery and
 * verification are done entirely by the authentication provider.
 */
export const preparePasswordReset = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ phone: z.string().min(3) }).parse(data))
  .handler(async ({ data }): Promise<{ found: boolean; message?: string }> => {
    if (!isValidPhone(data.phone)) {
      return { found: false, message: "Please enter a valid phone number." };
    }

    const phone = normalizePhone(data.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    if (error) {
      console.error("Password reset lookup failed", error);
      return { found: false, message: "We couldn't start the reset. Please try again." };
    }
    if (!profile) {
      return { found: false, message: "No Flamio account uses this phone number." };
    }

    const { error: attachError } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      phone: formatPhone(phone),
      phone_confirm: true,
    });

    if (attachError) {
      console.error("Attaching phone to auth user failed", attachError);
      return {
        found: false,
        message: "We couldn't prepare SMS verification for this account. Please contact support.",
      };
    }

    return { found: true };
  });
