import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { HandCoins, KeyRound, LogOut, Settings2, ShieldCheck, UserRound, Users, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useDashboardAccess } from "@/hooks/use-dashboard-access";
import { supabase } from "@/integrations/supabase/client";
import { formatPhone } from "@/lib/phone";
import { hasPermission } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/owner/account")({
  head: () => ({ meta: [
    { title: "Staff Account — Flamio" },
    { name: "description", content: "Manage your Flamio staff profile, access and account." },
    { property: "og:title", content: "Staff Account — Flamio" },
    { property: "og:description", content: "Manage your Flamio staff profile, access and account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: StaffAccountPage,
});

function StaffAccountPage() {
  const { profile, refreshProfile } = useAuth();
  const access = useDashboardAccess();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  useEffect(() => {
    setName(profile?.fullName ?? "");
    setEmail(profile?.email ?? "");
  }, [profile?.email, profile?.fullName]);
  const displayName = profile?.fullName?.trim() || (access.isManager ? "Flamio owner" : "Flamio staff");
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const assigned = Object.entries(access.data?.grants ?? {}).filter(([, level]) => level === "view" || level === "manage");

  const links: { to: "/owner/my-account" | "/owner/staff" | "/owner/staff-accounts" | "/owner/finance" | "/owner/settings"; label: string; detail: string; icon: typeof UserRound; show: boolean }[] = [
    // Owners use Owner Finance instead of the staff "My salary" concept.
    { to: "/owner/my-account", label: "My salary & money", detail: "Your own salary, profit share and money records", icon: WalletCards, show: !access.isManager && (hasPermission(access.data, "own_salary") || hasPermission(access.data, "own_money_taken") || hasPermission(access.data, "own_profit_share")) },
    { to: "/owner/finance", label: "Owner finance", detail: "Business profit, withdrawals and profit partners", icon: HandCoins, show: access.isManager },
    { to: "/owner/staff", label: "Staff & permissions", detail: "Team accounts, roles and assigned access", icon: Users, show: hasPermission(access.data, "staff") },
    { to: "/owner/staff-accounts", label: "Staff accounts & payroll", detail: "Salary, advances and payroll records", icon: WalletCards, show: access.isManager },
    { to: "/owner/settings", label: "Business settings", detail: "Restaurant, payments and communication", icon: Settings2, show: hasPermission(access.data, "settings") },
  ];


  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex items-center gap-4 p-4 sm:p-5">
          <Avatar className="size-16 border-2 border-border bg-secondary">
            <AvatarImage src={profile?.avatarUrl ?? undefined} alt={`${displayName} profile`} />
            <AvatarFallback className="font-display text-lg font-black">{initials || "F"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase text-primary">{access.isManager ? "Owner" : "Staff"}</p>
            <h2 className="truncate font-display text-xl font-black">{displayName}</h2>
            <p className="truncate text-sm text-muted-foreground">{profile?.phone ? formatPhone(profile.phone) : "Phone not added"}</p>
            <p className="truncate text-sm text-muted-foreground">{profile?.email || "Email not added"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <h2 className="font-display text-lg font-black">Profile</h2>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (event) => {
            event.preventDefault();
            if (!profile || name.trim().length < 2) {
              toast.error("Enter your full name.");
              return;
            }
            if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
              toast.error("Enter a valid email address.");
              return;
            }
            setSavingProfile(true);
            const { error } = await supabase.from("profiles").update({ full_name: name.trim(), email: email.trim() || null }).eq("id", profile.id);
            setSavingProfile(false);
            if (error) {
              toast.error("We couldn't save your profile.");
              return;
            }
            refreshProfile();
            toast.success("Profile saved");
          }}>
            <div className="space-y-1.5"><Label htmlFor="staff-profile-name">Name</Label><Input id="staff-profile-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></div>
            <div className="space-y-1.5"><Label htmlFor="staff-profile-email">Email</Label><Input id="staff-profile-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="staff-profile-phone">Phone</Label><Input id="staff-profile-phone" value={profile?.phone ? formatPhone(profile.phone) : "Not added"} readOnly /><p className="text-xs text-muted-foreground">Your verified login phone is managed by the owner.</p></div>
            <Button type="submit" className="sm:col-span-2" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save profile"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-black"><KeyRound className="size-5 text-primary" /> Change password</h2>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (event) => {
            event.preventDefault();
            if (!currentPassword) {
              toast.error("Enter your current password.");
              return;
            }
            if (newPassword.length < 8) {
              toast.error("New password must be at least 8 characters.");
              return;
            }
            setSavingPassword(true);
            const { error } = await supabase.auth.updateUser({ password: newPassword, current_password: currentPassword });
            setSavingPassword(false);
            if (error) {
              toast.error(error.message);
              return;
            }
            setCurrentPassword("");
            setNewPassword("");
            toast.success("Password changed");
          }}>
            <div className="space-y-1.5"><Label htmlFor="staff-current-password">Current password</Label><Input id="staff-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="staff-new-password">New password</Label><Input id="staff-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div>
            <Button type="submit" className="sm:col-span-2" disabled={savingPassword}>{savingPassword ? "Changing…" : "Change password"}</Button>
          </form>
        </CardContent>
      </Card>

      {!access.isManager ? (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4 text-primary" /> Assigned access</h2>
          <div className="flex flex-wrap gap-2">
            {assigned.length ? assigned.map(([permission, level]) => <span key={permission} className="rounded-md border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium capitalize">{permission.replaceAll("_", " ")} · {level === "view" ? "View only" : "Full access"}</span>) : <p className="text-sm text-muted-foreground">No work sections are assigned.</p>}
          </div>
        </section>
      ) : null}

      <section className="grid gap-2 sm:grid-cols-2">
        {links.filter((item) => item.show).map((item) => (
          <Link key={item.to} to={item.to} search={{}} className="flex min-h-20 items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-primary"><item.icon className="size-5" /></span>
            <span><span className="block font-bold">{item.label}</span><span className="block text-xs text-muted-foreground">{item.detail}</span></span>
          </Link>
        ))}
      </section>

      <Button variant="outline" className="w-full" onClick={async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
        await navigate({ to: "/auth", replace: true });
      }}><LogOut /> Logout</Button>
    </div>
  );
}