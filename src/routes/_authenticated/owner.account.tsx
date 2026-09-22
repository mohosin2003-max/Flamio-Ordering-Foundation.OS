import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, LogOut, Settings2, ShieldCheck, UserRound, Users, WalletCards } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  const { profile } = useAuth();
  const access = useDashboardAccess();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const displayName = profile?.fullName?.trim() || (access.isManager ? "Flamio owner" : "Flamio staff");
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const assigned = Object.entries(access.data?.grants ?? {}).filter(([, level]) => level === "view" || level === "manage");

  const links: { to: "/owner/my-account" | "/owner/staff" | "/owner/staff-accounts" | "/owner/settings"; label: string; detail: string; icon: typeof UserRound; show: boolean }[] = [
    { to: "/owner/my-account", label: "My salary & money", detail: "Your own salary and money records", icon: WalletCards, show: access.isManager || hasPermission(access.data, "own_salary") || hasPermission(access.data, "own_money_taken") },
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
        <Link to="/owner/my-account" className="flex min-h-20 items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-primary"><KeyRound className="size-5" /></span>
          <span><span className="block font-bold">Change password</span><span className="block text-xs text-muted-foreground">Update your secure sign-in password</span></span>
        </Link>
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