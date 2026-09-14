import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PERMISSION_HINTS,
  PERMISSION_LABELS,
  STAFF_PERMISSIONS,
} from "@/lib/permissions";
import {
  ownerCreateInvite,
  ownerDeleteInvite,
  ownerFindAccount,
  ownerListStaff,
  ownerRevokeStaff,
  ownerSetStaffPermissions,
  ownerSetStaffRole,
} from "@/lib/staff.functions";
import type { StaffRole } from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/owner/staff")({
  component: OwnerStaff,
});

const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Owner",
  admin: "Manager",
  staff: "Staff",
};

function OwnerStaff() {
  const listStaff = useServerFn(ownerListStaff);
  const setRole = useServerFn(ownerSetStaffRole);
  const revoke = useServerFn(ownerRevokeStaff);
  const createInvite = useServerFn(ownerCreateInvite);
  const deleteInvite = useServerFn(ownerDeleteInvite);
  const findAccount = useServerFn(ownerFindAccount);
  const setPermissions = useServerFn(ownerSetStaffPermissions);
  const queryClient = useQueryClient();

  const [invitePhone, setInvitePhone] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [inviteRole, setInviteRole] = useState<StaffRole>("staff");
  const [busy, setBusy] = useState(false);
  const [savingFor, setSavingFor] = useState<string | null>(null);

  const staff = useQuery({ queryKey: ["owner-staff"], queryFn: () => listStaff() });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["owner-staff"] });
    await queryClient.invalidateQueries({ queryKey: ["owner-access"] });
  };

  if (staff.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (staff.error || !staff.data) {
    return (
      <EmptyState
        title="Couldn't load the team"
        description="Please try again."
        action={<Button onClick={() => void staff.refetch()}>Retry</Button>}
      />
    );
  }

  const { members, invites, me } = staff.data;

  const handleAdd = async () => {
    const phone = invitePhone.trim();
    if (phone.length < 6) {
      toast.error("Enter a phone number or email");
      return;
    }
    setBusy(true);
    try {
      const match = await findAccount({ data: { query: phone } });
      if (match) {
        await setRole({ data: { userId: match.userId, role: inviteRole } });
        toast.success(`${match.fullName ?? "Account"} now has ${ROLE_LABEL[inviteRole]} access`);
      } else {
        await createInvite({
          data: { phone, note: inviteNote.trim() ? inviteNote.trim() : null },
        });
        toast.success("Invite saved — grant access once they sign up");
      }
      setInvitePhone("");
      setInviteNote("");
      await invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add this person");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Add a team member</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            They sign up in the app like any customer. Enter their phone number (or email) here — if
            the account already exists we give them access right away, otherwise we keep the invite
            until they join.
          </p>

          <div className="space-y-1.5">
            <Label>Phone number or email</Label>
            <Input
              value={invitePhone}
              placeholder="01XXXXXXXXX"
              onChange={(event) => setInvitePhone(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as StaffRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff (kitchen & orders)</SelectItem>
                <SelectItem value="admin">Manager (full dashboard)</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input
              value={inviteNote}
              placeholder="Evening shift"
              onChange={(event) => setInviteNote(event.target.value)}
            />
          </div>
          <Button className="w-full" disabled={busy} onClick={handleAdd}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold">Team ({members.length})</h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one has dashboard access yet.</p>
        ) : (
          members.map((member) => (
            <Card key={member.userId}>
              <CardContent className="space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {member.fullName ?? "Unnamed account"}
                      {member.userId === me ? " (you)" : ""}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {member.phone ?? member.email ?? "No contact saved"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {member.roles.map((role) => (
                      <Badge key={role} variant="secondary">
                        {ROLE_LABEL[role]}
                      </Badge>
                    ))}
                  </div>
                </div>

                {member.roles.includes("owner") || member.roles.includes("admin") ? (
                  <p className="text-xs text-muted-foreground">
                    Full access to every section of the dashboard.
                  </p>
                ) : (
                  <div className="space-y-2 rounded-lg border border-border p-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Can open
                    </p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {STAFF_PERMISSIONS.map((permission) => {
                        const checked = member.permissions.includes(permission);
                        return (
                          <label
                            key={permission}
                            className="flex items-start gap-2 rounded-md px-1 py-1 text-sm"
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={checked}
                              disabled={savingFor === member.userId}
                              onCheckedChange={async (value) => {
                                const next = value
                                  ? [...member.permissions, permission]
                                  : member.permissions.filter((p) => p !== permission);
                                setSavingFor(member.userId);
                                try {
                                  await setPermissions({
                                    data: { userId: member.userId, permissions: next },
                                  });
                                  await invalidate();
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "Couldn't update access",
                                  );
                                } finally {
                                  setSavingFor(null);
                                }
                              }}
                            />
                            <span className="leading-tight">
                              {PERMISSION_LABELS[permission]}
                              {PERMISSION_HINTS[permission] ? (
                                <span className="block text-xs text-muted-foreground">
                                  {PERMISSION_HINTS[permission]}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Select
                    value={member.roles[0] ?? "staff"}
                    onValueChange={async (value) => {
                      try {
                        await setRole({ data: { userId: member.userId, role: value as StaffRole } });
                        await invalidate();
                        toast.success("Access updated");
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "Couldn't update access",
                        );
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="admin">Manager</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={member.userId === me}
                    onClick={async () => {
                      if (!confirm(`Remove dashboard access for ${member.fullName ?? "this person"}?`))
                        return;
                      try {
                        await revoke({ data: { userId: member.userId } });
                        await invalidate();
                        toast.success("Access removed");
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "Couldn't remove access",
                        );
                      }
                    }}
                  >
                    Remove access
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold">Pending invites ({invites.length})</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invites.</p>
        ) : (
          invites.map((invite) => (
            <Card key={invite.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{invite.phone}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {invite.note ?? "No note"}
                    {invite.matchedUserId ? " · account found" : " · waiting for sign-up"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {invite.matchedUserId ? (
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          await setRole({
                            data: { userId: invite.matchedUserId as string, role: "staff" },
                          });
                          await deleteInvite({ data: { id: invite.id } });
                          await invalidate();
                          toast.success("Staff access granted");
                        } catch (error) {
                          toast.error(
                            error instanceof Error ? error.message : "Couldn't grant access",
                          );
                        }
                      }}
                    >
                      Grant staff access
                    </Button>
                  ) : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await deleteInvite({ data: { id: invite.id } });
                        await invalidate();
                      } catch {
                        toast.error("Couldn't remove this invite");
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
