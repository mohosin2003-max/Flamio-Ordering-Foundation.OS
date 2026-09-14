import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, UtensilsCrossed, Settings2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ownerListOrders } from "@/lib/owner.functions";
import { formatBDT } from "@/lib/format";
import { isActiveOrder } from "@/lib/order-status";

export const Route = createFileRoute("/_authenticated/owner/")({
  component: OwnerHome,
});

function OwnerHome() {
  const listOrders = useServerFn(ownerListOrders);
  const orders = useQuery({
    queryKey: ["owner-orders"],
    queryFn: () => listOrders(),
    refetchInterval: 30_000,
  });

  const data = orders.data ?? [];
  const active = data.filter((o) => isActiveOrder(o.status));
  const today = new Date().toDateString();
  const todays = data.filter((o) => new Date(o.createdAt).toDateString() === today);
  const revenue = todays.reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="space-y-6">
      {orders.isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Active orders" value={String(active.length)} />
          <Stat label="Orders today" value={String(todays.length)} />
          <Stat label="Revenue today" value={formatBDT(revenue)} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLink to="/owner/orders" icon={<ClipboardList className="h-5 w-5" />} label="Orders" />
        <QuickLink to="/owner/menu" icon={<UtensilsCrossed className="h-5 w-5" />} label="Menu" />
        <QuickLink to="/owner/settings" icon={<Settings2 className="h-5 w-5" />} label="Settings" />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
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
