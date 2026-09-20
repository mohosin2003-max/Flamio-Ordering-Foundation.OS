import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, UtensilsCrossed, Settings2 } from "lucide-react";

import { PushToggle } from "@/components/notifications/PushToggle";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBDT } from "@/lib/format";
import { getOwnerAccess } from "@/lib/owner.functions";
import { hasPermission, type StaffPermission } from "@/lib/permissions";
import { ownerGetDashboardSummary } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/owner/")({
  component: OwnerHome,
});

function OwnerHome() {
  const fetchAccess = useServerFn(getOwnerAccess);
  const access = useQuery({
    queryKey: ["owner-access"],
    queryFn: () => fetchAccess(),
    staleTime: 60_000,
  });
  const can = (permission: StaffPermission) => hasPermission(access.data, permission);
  const canSeeOrders = can("online_orders") || can("order_management");
  const getSummary = useServerFn(ownerGetDashboardSummary);
  const summary = useQuery({ queryKey: ["owner-dashboard-summary"], queryFn: () => getSummary(), enabled: Boolean(access.data), refetchInterval: 30_000 });

  const s = summary.data;

  return (
    <div className="space-y-6">
      <PushToggle />
      <SummarySection title="TODAY">
        {canSeeOrders || can("pos") || can("platform_sales") ? <SummaryLink to="/owner/orders" label="Today's sales" value={formatBDT(s?.todaySales ?? 0)} /> : null}
        {canSeeOrders ? <SummaryLink to="/owner/orders" label="Today's customers / orders" value={`${s?.todayCustomers ?? 0} / ${s?.todayOrders ?? 0}`} /> : null}
        {can("purchases") ? <SummaryLink to="/owner/purchases" label="Today's expenses" value={formatBDT(s?.todayExpenses ?? 0)} /> : null}
        {can("staff_finance") ? <SummaryLink to="/owner/staff-accounts" label="Staff money activity" value={formatBDT(s?.todayStaffActivity ?? 0)} /> : null}
      </SummarySection>
      <SummarySection title="OPERATIONS">
        {canSeeOrders ? <SummaryLink to="/owner/orders" label="Active online orders" value={String(s?.activeOnlineOrders ?? 0)} /> : null}
        {can("inventory") ? <SummaryLink to="/owner/inventory" label="Current inventory" value={`${s?.inventory.totalItems ?? 0} items · ${s?.inventory.lowStock ?? 0} low · ${s?.inventory.outOfStock ?? 0} out`} /> : null}
      </SummarySection>
      {can("reports") ? <SummarySection title="REPORT SUMMARY">
        <SummaryLink to="/owner/reports" label="Total sales" value={formatBDT(s?.reports.sales ?? 0)} />
        <SummaryLink to="/owner/reports" label="Total expenses" value={formatBDT(s?.reports.expenses ?? 0)} />
        <SummaryLink to="/owner/reports" label="Current net / profit" value={formatBDT(s?.reports.net ?? 0)} />
      </SummarySection> : null}
      {summary.isLoading ? <Skeleton className="h-28 w-full" /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {canSeeOrders ? (
          <QuickLink to="/owner/orders" icon={<ClipboardList className="h-5 w-5" />} label="Orders" />
        ) : null}
        {can("menu") ? (
          <QuickLink to="/owner/menu" icon={<UtensilsCrossed className="h-5 w-5" />} label="Menu" />
        ) : null}
        {can("settings") ? (
          <QuickLink to="/owner/settings" icon={<Settings2 className="h-5 w-5" />} label="Settings" />
        ) : null}
      </div>
    </div>
  );
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-2 text-xs font-semibold tracking-widest text-muted-foreground">{title}</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div></section>;
}

function SummaryLink({ to, label, value }: { to: "/owner/orders" | "/owner/purchases" | "/owner/staff-accounts" | "/owner/inventory" | "/owner/reports"; label: string; value: string }) {
  return <Link to={to} className="rounded-xl border border-border bg-card p-4 shadow-card transition-colors hover:bg-muted"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg font-bold">{value}</p></Link>;
}

function QuickLink({
  to,
  icon,
  label,
}: {
  to: "/owner/orders" | "/owner/menu" | "/owner/settings";
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted"
    >
      {icon}
      <span className="font-medium">{label}</span>
    </Link>
  );
}
