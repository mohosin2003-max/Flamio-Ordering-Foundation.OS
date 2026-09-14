/**
 * Server-only owner authorization. Roles live in `public.user_roles` and are
 * checked with the SECURITY DEFINER `has_role` function, which is executable
 * by the service role only — never by the browser.
 *
 * Granular staff access reuses the same roles table plus
 * `public.staff_permissions`: owners and managers (admins) stay unrestricted,
 * while a `staff` member only gets the sections switched on for them.
 */

import { STAFF_PERMISSIONS } from "@/lib/permissions";
import type { StaffPermission } from "@/lib/permissions";

export type OwnerContext = { userId: string };

export type AccessProfile = {
  isOwner: boolean;
  isManager: boolean;
  isStaff: boolean;
  permissions: StaffPermission[];
};

/** Roles + effective permissions for a user. Owner/manager => everything. */
export async function getAccessProfile(userId: string): Promise<AccessProfile> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: roleRows, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (roleError) {
    console.error("Role check failed", roleError);
    throw new Error("We couldn't verify your access. Please try again.");
  }

  const roles = (roleRows ?? []).map((r) => r.role as string);
  const isOwner = roles.includes("owner");
  const isManager = isOwner || roles.includes("admin");
  const isStaff = roles.includes("staff");

  if (isManager) {
    return { isOwner, isManager: true, isStaff, permissions: [...STAFF_PERMISSIONS] };
  }

  if (!isStaff) {
    return { isOwner: false, isManager: false, isStaff: false, permissions: [] };
  }

  const { data: permRows } = await supabaseAdmin
    .from("staff_permissions")
    .select("permission")
    .eq("user_id", userId);

  const permissions = (permRows ?? [])
    .map((r) => r.permission as StaffPermission)
    .filter((p) => (STAFF_PERMISSIONS as readonly string[]).includes(p));

  return { isOwner: false, isManager: false, isStaff: true, permissions };
}

/** Owner or manager only (unchanged behaviour for owner-level endpoints). */
export async function assertOwner(userId: string): Promise<void> {
  const access = await getAccessProfile(userId);
  if (!access.isManager) throw new Error("Forbidden");
}

/** Owner/manager, or a staff member with this permission switched on. */
export async function assertPermission(
  userId: string,
  permission: StaffPermission,
): Promise<AccessProfile> {
  return assertAnyPermission(userId, [permission]);
}

/** Owner/manager, or a staff member holding at least one of these. */
export async function assertAnyPermission(
  userId: string,
  permissions: StaffPermission[],
): Promise<AccessProfile> {
  const access = await getAccessProfile(userId);
  if (access.isManager) return access;
  if (access.isStaff && permissions.some((p) => access.permissions.includes(p))) return access;
  throw new Error("Forbidden");
}
