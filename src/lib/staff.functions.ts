import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACCESS_LEVELS, STAFF_PERMISSIONS, isAccessLevel, isStaffPermission } from "@/lib/permissions";
import type { PermissionGrants, StaffAccessLevel, StaffPermission } from "@/lib/permissions";

/**
 * Staff / role management for the owner area.
 *
 * Reuses the EXISTING tables only:
 *  - `public.user_roles`   (owner / admin / staff — the real permission source)
 *  - `public.owner_invites` (already existed, previously unused: pending invites by phone)
 *  - `public.profiles`     (display info: name, phone, email)
 *
 * No new storage, no passwords handled here — people sign up through the normal
 * sign-up screen and the owner grants them a role.
 */

export type StaffRole = "owner" | "admin" | "staff";

export type StaffMember = {
  userId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  roles: StaffRole[];
  /** Sections this person can open. Owners/managers always have all of them. */
  permissions: StaffPermission[];
  /** Access level per granted section. */
  grants: PermissionGrants;
  joinedAt: string | null;
};

export type StaffInvite = {
  id: string;
  phone: string;
  note: string | null;
  createdAt: string;
  /** Set when somebody has since signed up with this phone number. */
  matchedUserId: string | null;
  matchedName: string | null;
};

const rolesEnum = z.enum(["owner", "admin", "staff"]);

const normalizePhone = (value: string) => value.replace(/\s+/g, "");

export const ownerListStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ members: StaffMember[]; invites: StaffInvite[]; me: string }> => {
      const { assertPermission } = await import("@/lib/owner.server");
      await assertPermission(context.userId, "staff", "view");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const [{ data: roleRows }, { data: inviteRows }] = await Promise.all([
        supabaseAdmin
          .from("user_roles")
          .select("user_id, role, created_at")
          .order("created_at"),
        supabaseAdmin
          .from("owner_invites")
          .select("id, phone, note, created_at")
          .order("created_at", { ascending: false }),
      ]);

      const userIds = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
      const invitePhones = (inviteRows ?? []).map((i) => normalizePhone(i.phone));

      const [{ data: staffProfiles }, { data: invitedProfiles }] = await Promise.all([
        userIds.length
          ? supabaseAdmin.from("profiles").select("id, full_name, phone, email").in("id", userIds)
          : Promise.resolve({ data: [] as never[] }),
        invitePhones.length
          ? supabaseAdmin
              .from("profiles")
              .select("id, full_name, phone")
              .in("phone", invitePhones)
          : Promise.resolve({ data: [] as never[] }),
      ]);

      const profileById = new Map(
        (staffProfiles ?? []).map((p) => [
          p.id as string,
          p as { id: string; full_name: string | null; phone: string | null; email: string | null },
        ]),
      );

      const profileByPhone = new Map(
        (invitedProfiles ?? []).map((p) => [
          normalizePhone((p as { phone: string | null }).phone ?? ""),
          p as { id: string; full_name: string | null; phone: string | null },
        ]),
      );

      const byUser = new Map<string, StaffMember>();
      for (const row of roleRows ?? []) {
        const existing = byUser.get(row.user_id);
        if (existing) {
          existing.roles.push(row.role as StaffRole);
          continue;
        }
        const profile = profileById.get(row.user_id);
        byUser.set(row.user_id, {
          userId: row.user_id,
          fullName: profile?.full_name ?? null,
          phone: profile?.phone ?? null,
          email: profile?.email ?? null,
          roles: [row.role as StaffRole],
          permissions: [],
          grants: {},
          joinedAt: row.created_at,
        });
      }

      // Effective access: managers are unrestricted, staff get their own rows.
      let permRows: { user_id: string; permission: string; access_level?: string | null }[] = [];
      if (userIds.length) {
        const { untypedAdmin } = await import("@/lib/untyped-db.server");
        const withLevel = await (await untypedAdmin())
          .from("staff_permissions")
          .select("user_id, permission, access_level")
          .in("user_id", userIds);
        if (withLevel.error) {
          const plain = await supabaseAdmin
            .from("staff_permissions")
            .select("user_id, permission")
            .in("user_id", userIds);
          permRows = (plain.data ?? []) as typeof permRows;
        } else {
          permRows = (withLevel.data ?? []) as unknown as typeof permRows;
        }
      }

      for (const member of byUser.values()) {
        const isManager = member.roles.includes("owner") || member.roles.includes("admin");
        if (isManager) {
          member.permissions = [...STAFF_PERMISSIONS];
          member.grants = Object.fromEntries(
            STAFF_PERMISSIONS.map((p) => [p, "manage" as StaffAccessLevel]),
          );
          continue;
        }
        const grants: PermissionGrants = {};
        for (const row of permRows) {
          if (row.user_id !== member.userId) continue;
          if (!isStaffPermission(row.permission)) continue;
          grants[row.permission] =
            row.access_level && isAccessLevel(row.access_level) ? row.access_level : "manage";
        }
        member.grants = grants;
        member.permissions = Object.keys(grants) as StaffPermission[];
      }


      const invites: StaffInvite[] = (inviteRows ?? []).map((invite) => {
        const match = profileByPhone.get(normalizePhone(invite.phone)) ?? null;
        const alreadyStaff = match ? byUser.has(match.id) : false;
        return {
          id: invite.id,
          phone: invite.phone,
          note: invite.note,
          createdAt: invite.created_at,
          matchedUserId: match && !alreadyStaff ? match.id : null,
          matchedName: match && !alreadyStaff ? match.full_name : null,
        };
      });

      return { members: Array.from(byUser.values()), invites, me: context.userId };
    },
  );

/** Records a pending invite by phone number (reuses `owner_invites`). */
export const ownerCreateInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        phone: z.string().trim().min(6).max(24),
        note: z.string().trim().max(200).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "staff");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("owner_invites")
      .insert({ phone: normalizePhone(data.phone), note: data.note });

    if (error) {
      console.error("Create invite failed", error);
      throw new Error("We couldn't save this invite. Please try again.");
    }
    return { ok: true };
  });

export const ownerDeleteInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertPermission } = await import("@/lib/owner.server");
    await assertPermission(context.userId, "staff");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("owner_invites").delete().eq("id", data.id);
    if (error) {
      console.error("Delete invite failed", error);
      throw new Error("We couldn't remove this invite. Please try again.");
    }
    return { ok: true };
  });

/** Grants (or changes) a role for an existing account. */
export const ownerSetStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), role: rolesEnum }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertOwner } = await import("@/lib/owner.server");
    await assertOwner(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Only a full owner may create or change another owner.
    const { data: callerIsOwner } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (data.role === "owner" && !callerIsOwner) {
      throw new Error("Only an owner can give owner access.");
    }

    const { data: current } = await supabaseAdmin
      .from("user_roles")
      .select("id, role")
      .eq("user_id", data.userId);

    const targetIsOwner = (current ?? []).some((r) => r.role === "owner");
    if (targetIsOwner && data.role !== "owner" && !callerIsOwner) {
      throw new Error("Only an owner can change owner access.");
    }

    // Replace the person's roles with the single selected role.
    const stale = (current ?? []).filter((r) => r.role !== data.role).map((r) => r.id);
    if (stale.length) {
      if (targetIsOwner) {
        const { count } = await supabaseAdmin
          .from("user_roles")
          .select("id", { count: "exact", head: true })
          .eq("role", "owner");
        if ((count ?? 0) <= 1 && data.role !== "owner") {
          // Expected validation, not a crash: return it so the UI can show a message.
          return {
            ok: false as const,
            message: "This is the only owner — give someone else owner access first.",
          };
        }

      }
      const { error: delError } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .in("id", stale);
      if (delError) {
        console.error("Role cleanup failed", delError);
        throw new Error("We couldn't update this person's access. Please try again.");
      }
    }

    if (!(current ?? []).some((r) => r.role === data.role)) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role });
      if (error && error.code !== "23505") {
        console.error("Grant role failed", error);
        throw new Error("We couldn't update this person's access. Please try again.");
      }
    }

    return { ok: true };
  });

/** Turns dashboard access off by removing the person's role rows. */
export const ownerRevokeStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertOwner } = await import("@/lib/owner.server");
    await assertOwner(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.userId === context.userId) {
      throw new Error("You can't remove your own access.");
    }

    const { data: current } = await supabaseAdmin
      .from("user_roles")
      .select("id, role")
      .eq("user_id", data.userId);

    if ((current ?? []).some((r) => r.role === "owner")) {
      const { data: callerIsOwner } = await supabaseAdmin.rpc("has_role", {
        _user_id: context.userId,
        _role: "owner",
      });
      if (!callerIsOwner) throw new Error("Only an owner can remove owner access.");

      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner");
      if ((count ?? 0) <= 1) {
        throw new Error("This is the only owner — give someone else owner access first.");
      }
    }

    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);

    if (error) {
      console.error("Revoke access failed", error);
      throw new Error("We couldn't remove this person's access. Please try again.");
    }
    return { ok: true };
  });

/** Finds an existing account by phone or email so a role can be granted to it. */
export const ownerFindAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().min(3).max(120) }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ userId: string; fullName: string | null; phone: string | null } | null> => {
      const { assertPermission } = await import("@/lib/owner.server");
      await assertPermission(context.userId, "staff");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const value = normalizePhone(data.query);
      const { data: rows } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, phone")
        .or(`phone.eq.${value},email.eq.${data.query.trim()}`)
        .limit(1);

      const match = (rows ?? [])[0];
      if (!match) return null;
      return { userId: match.id, fullName: match.full_name, phone: match.phone };
    },
  );

/**
 * Replaces the sections a `staff` member can open. Owners and managers are
 * unrestricted, so their permission rows are not used.
 */
export const ownerSetStaffPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        permissions: z.array(z.enum(STAFF_PERMISSIONS)).max(STAFF_PERMISSIONS.length).optional(),
        grants: z
          .array(
            z.object({
              permission: z.enum(STAFF_PERMISSIONS),
              level: z.enum(ACCESS_LEVELS),
            }),
          )
          .max(STAFF_PERMISSIONS.length)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertOwner } = await import("@/lib/owner.server");
    await assertOwner(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Accepts either the newer {permission, level} list or the older flat list
    // (which keeps its existing meaning: full access).
    const wanted = new Map<StaffPermission, StaffAccessLevel>();
    for (const permission of data.permissions ?? []) wanted.set(permission, "manage");
    for (const grant of data.grants ?? []) wanted.set(grant.permission, grant.level);

    const { error: delError } = await supabaseAdmin
      .from("staff_permissions")
      .delete()
      .eq("user_id", data.userId);
    if (delError) {
      console.error("Permission cleanup failed", delError);
      throw new Error("We couldn't update this person's access. Please try again.");
    }

    if (wanted.size) {
      const rows = [...wanted.entries()].map(([permission, level]) => ({
        user_id: data.userId,
        permission,
        access_level: level,
      }));
      const { untypedAdmin } = await import("@/lib/untyped-db.server");
      const { error } = await (await untypedAdmin()).from("staff_permissions").insert(rows);
      if (error) {
        // Database without the access_level column yet: keep existing behaviour.
        const { error: plainError } = await supabaseAdmin
          .from("staff_permissions")
          .insert(rows.map(({ user_id, permission }) => ({ user_id, permission })));
        if (plainError) {
          console.error("Grant permissions failed", error, plainError);
          throw new Error("We couldn't update this person's access. Please try again.");
        }
      }
    }

    return { ok: true };
  });
