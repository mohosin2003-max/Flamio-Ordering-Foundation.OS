/**
 * Phone helpers. Phone is the primary customer identifier; email is optional.
 * Supabase password auth requires an email, so we derive a deterministic
 * address from the normalized phone number and keep any real email in the
 * customer profile.
 */

/** Normalizes any Bangladeshi input to a bare international number (8801XXXXXXXXX). */
export function normalizePhone(raw: string): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("880")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return `880${digits}`;
}

export function isValidPhone(raw: string): boolean {
  const digits = normalizePhone(raw);
  return digits.length >= 12 && digits.length <= 15;
}

export function formatPhone(raw: string): string {
  return `+${normalizePhone(raw)}`;
}

/** Deterministic auth email so one phone number maps to exactly one account. */
export function phoneToAuthEmail(raw: string): string {
  return `p${normalizePhone(raw)}@phone.flamio.app`;
}
