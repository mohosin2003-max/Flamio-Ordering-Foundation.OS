import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { normalizePhone } from "@/lib/phone";

/**
 * Abuse protection for the duplicate check below. The limit is keyed on the
 * CALLER (IP address), not on the phone/email being checked, so an attacker
 * cannot bypass it by rotating the identity they probe.
 *
 * Storage is a per-worker in-memory sliding window: the project runs on
 * stateless serverless workers, so this is best-effort rather than a hard
 * global cap — but each worker still caps a probing caller, which breaks
 * bulk enumeration scripts in practice. No database table is used, per the
 * project's no-schema-change constraint.
 */
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_CHECKS_PER_WINDOW = 20;
const MAX_TRACKED_KEYS = 5000;

const checkLog = new Map<string, number[]>();

function callerKey(): string {
  try {
    const request = getRequest();
    const headers = request?.headers;
    if (!headers) return "unknown";
    const cf = headers.get("cf-connecting-ip");
    if (cf) return cf.trim();
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0];
      if (first) return first.trim();
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Returns true when the caller has exceeded the window and must be refused. */
function isRateLimited(key: string): boolean {
  const now = Date.now();
  // Bound memory: drop the whole log if it grows past the cap.
  if (checkLog.size > MAX_TRACKED_KEYS) checkLog.clear();
  const recent = (checkLog.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CHECKS_PER_WINDOW) {
    checkLog.set(key, recent);
    return true;
  }
  recent.push(now);
  checkLog.set(key, recent);
  return false;
}

/**
 * Pre-signup duplicate detection. Runs server-side only and returns two
 * booleans — never account data, auth records, or provider details.
 */
export const checkSignupDuplicates = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        phone: z.string().trim().min(6).max(30),
        email: z.string().trim().max(160).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    // Rate-limit before touching the database. The limited response is the
    // same "nothing found" shape, so it never reveals account details and
    // gives a probing caller no useful signal.
    if (isRateLimited(callerKey())) {
      return { phoneExists: false, emailExists: false };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const phone = normalizePhone(data.phone);
    const email = data.email ? data.email.trim().toLowerCase() : "";

    const phoneResult = await supabaseAdmin.from("profiles").select("id").eq("phone", phone).limit(1);
    const emailResult = email
      ? await supabaseAdmin.from("profiles").select("id").eq("email", email).limit(1)
      : { data: [] as { id: string }[] };

    return {
      phoneExists: (phoneResult.data?.length ?? 0) > 0,
      emailExists: (emailResult.data?.length ?? 0) > 0,
    };
  });
