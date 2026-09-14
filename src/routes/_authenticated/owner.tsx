import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import { claimOwnership, getOwnerAccess } from "@/lib/owner.functions";
import { hasPermission } from "@/lib/permissions";
import type { StaffPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * Owner area shell. The real access boundary lives in the server functions
 * (every owner endpoint re-checks the caller's role); this gate is UX only.
 */
export const Route = createFileRoute("/_authenticated/owner")({
  head: () => ({
    meta: [
      { title: "Owner Dashboard — Flamio" },
      { name: "description", content: "Manage Flamio orders, menu and restaurant settings." },
      { property: "og:title", content: "Owner Dashboard — Flamio" },
      { property: "og:description", content: "Manage Flamio orders, menu and restaurant settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OwnerLayout,
});

/** `permission: null` means everyone with dashboard access sees the tab. */
const TABS: {
  to: string;
  label: string;
  exact: boolean;
  permission: StaffPermission | null;
}[] = [
  { to: "/owner", label: "Home", exact: true, permission: null },
  { to: "/owner/orders", label: "Orders", exact: false, permission: "online_orders" },
  { to: "/owner/pos", label: "Counter sale", exact: false, permission: "pos" },
  { to: "/owner/menu", label: "Menu", exact: false, permission: "menu" },
  { to: "/owner/inventory", label: "Inventory", exact: false, permission: "inventory" },
  { to: "/owner/purchases", label: "Purchases", exact: false, permission: "purchases" },
  { to: "/owner/suppliers", label: "Suppliers", exact: false, permission: "suppliers" },
  { to: "/owner/delivery", label: "Delivery", exact: false, permission: "settings" },
  { to: "/owner/riders", label: "Riders", exact: false, permission: "order_management" },
  { to: "/owner/coupons", label: "Coupons", exact: false, permission: "coupons" },
  { to: "/owner/rewards", label: "Rewards", exact: false, permission: "coupons" },
  { to: "/owner/banners", label: "Banners", exact: false, permission: "menu" },
  { to: "/owner/reports", label: "Reports", exact: false, permission: "reports" },
  { to: "/owner/customers", label: "Customers", exact: false, permission: "customers" },
  { to: "/owner/staff", label: "Staff", exact: false, permission: "staff" },
  { to: "/owner/settings", label: "Settings", exact: false, permission: "settings" },
];

function OwnerLayout() {
  const fetchAccess = useServerFn(getOwnerAccess);
  const claim = useServerFn(claimOwnership);
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState(false);

  const access = useQuery({
    queryKey: ["owner-access"],
    queryFn: () => fetchAccess(),
    staleTime: 60 * 1000,
  });

  if (access.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (access.error) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <EmptyState
          title="Couldn't check your access"
          description="Something went wrong while verifying your owner access."
          action={<Button onClick={() => void access.refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  if (!access.data?.isOwner) {
    const canClaim = Boolean(access.data?.canClaim);
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            {canClaim ? (
              <ShieldCheck className="h-6 w-6 text-primary" />
            ) : (
              <Lock className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <h3 className="mt-4 font-display text-lg font-bold">
            {canClaim ? "Set up your owner access" : "Owner access required"}
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            {canClaim
              ? "No owner has been set up for Flamio yet. Claim owner access with this account to manage orders, the menu and restaurant settings."
              : "This account doesn't have owner permissions yet. Ask the restaurant owner to grant you access, then refresh this page."}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {canClaim ? (
              <Button
                disabled={claiming}
                onClick={async () => {
                  setClaiming(true);
                  try {
                    await claim({});
                    await queryClient.invalidateQueries({ queryKey: ["owner-access"] });
                    toast.success("Owner access enabled");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Couldn't enable owner access",
                    );
                  } finally {
                    setClaiming(false);
                  }
                }}
              >
                {claiming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Claim owner access
              </Button>
            ) : (
              <Button variant="outline" onClick={() => void access.refetch()}>
                Check again
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link to="/">Back to Flamio</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <header className="mb-5">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="h-4 w-4" /> Owner
        </p>
        <h1 className="font-display text-2xl font-bold">Dashboard</h1>
      </header>

      <nav className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {TABS.filter(
          (tab) => tab.permission === null || hasPermission(access.data, tab.permission),
        ).map((tab) => (
          <Link
            key={tab.to}
            to={tab.to as never}
            activeOptions={{ exact: tab.exact }}
            className={cn(
              "whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors",
              "hover:bg-muted",
            )}
            activeProps={{ className: "bg-primary text-primary-foreground border-primary" }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
