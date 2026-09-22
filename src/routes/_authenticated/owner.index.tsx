import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { LucideIcon } from "lucide-react";
import { Boxes, ChefHat, ClipboardList, Contact, CookingPot, Gift, HandCoins, Images, LayoutGrid, MessageCircle, PackageCheck, ReceiptText, Settings2, ShieldCheck, Tags, Truck, Users, UtensilsCrossed, WalletCards } from "lucide-react";

import { PushToggle } from "@/components/notifications/PushToggle";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBDT } from "@/lib/format";
import { getOwnerAccess } from "@/lib/owner.functions";
import { hasPermission, type StaffPermission } from "@/lib/permissions";
import { ownerGetDashboardSummary } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/owner/")({
  head: () => ({ meta: [
    { title: "Workspace Home — Flamio" },
    { name: "description", content: "Flamio owner and staff workspace." },
    { property: "og:title", content: "Workspace Home — Flamio" },
    { property: "og:description", content: "Flamio owner and staff workspace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: OwnerHome,
});

type Module = { to: string; label: string; description: string; icon: LucideIcon; permission: StaffPermission | StaffPermission[]; ownerOnly?: boolean; prominent?: boolean };

const MODULES: Module[] = [
  { to: "/owner/pos", label: "Counter Sale", description: "Create an in-store sale", icon: ReceiptText, permission: "pos", prominent: true },
  { to: "/kitchen", label: "Kitchen", description: "Open the live kitchen queue", icon: ChefHat, permission: "kitchen", prominent: true },
  { to: "/owner/orders", label: "Orders", description: "Manage online orders", icon: ClipboardList, permission: ["online_orders", "order_management"], prominent: true },
  { to: "/owner/inbox", label: "Messages", description: "Reply to customers", icon: MessageCircle, permission: "customers", prominent: true },
  { to: "/owner/inventory", label: "Inventory", description: "Stock and ingredients", icon: Boxes, permission: "inventory" },
  { to: "/owner/purchases", label: "Purchases", description: "Record business expenses", icon: PackageCheck, permission: "purchases" },
  { to: "/owner/suppliers", label: "Suppliers", description: "Supplier records", icon: Truck, permission: "suppliers" },
  { to: "/owner/customers", label: "Customers", description: "Customer information", icon: Contact, permission: "customers" },
  { to: "/owner/challenges", label: "Challenges", description: "Games and results", icon: CookingPot, permission: "challenges" },
  { to: "/owner/rewards", label: "Rewards", description: "Points and reward rules", icon: Gift, permission: "rewards" },
  { to: "/owner/delivery", label: "Delivery", description: "Zones and charges", icon: Truck, permission: "delivery" },
  { to: "/owner/riders", label: "Riders", description: "Delivery team", icon: Users, permission: "riders" },
  { to: "/owner/reports", label: "Reports", description: "Sales and performance", icon: LayoutGrid, permission: "reports" },
  { to: "/owner/menu", label: "Menu", description: "Products and availability", icon: UtensilsCrossed, permission: "menu" },
  { to: "/owner/combos", label: "Combos", description: "Meal combinations", icon: UtensilsCrossed, permission: "combos" },
  { to: "/owner/coupons", label: "Coupons", description: "Offers and discounts", icon: Tags, permission: "coupons" },
  { to: "/owner/banners", label: "Banners", description: "Home promotions", icon: Images, permission: "banners" },
  { to: "/owner/reviews", label: "Reviews", description: "Customer feedback", icon: MessageCircle, permission: "reviews" },
  { to: "/owner/platforms", label: "Platforms", description: "Delivery platform sales", icon: HandCoins, permission: "platform_sales" },
  { to: "/owner/staff", label: "Staff", description: "People and permissions", icon: ShieldCheck, permission: "staff" },
  { to: "/owner/staff-accounts", label: "Payroll", description: "Staff salary accounts", icon: WalletCards, permission: "staff_finance", ownerOnly: true },
  { to: "/owner/settings", label: "Settings", description: "Business configuration", icon: Settings2, permission: "settings" },
];

function OwnerHome() {
  const fetchAccess = useServerFn(getOwnerAccess);
  const access = useQuery({ queryKey: ["owner-access"], queryFn: () => fetchAccess(), staleTime: 60_000 });
  const can = (permission: StaffPermission | StaffPermission[]) => (Array.isArray(permission) ? permission : [permission]).some((item) => hasPermission(access.data, item));
  const canSeeOrders = can(["online_orders", "order_management"]);
  const getSummary = useServerFn(ownerGetDashboardSummary);
  const summary = useQuery({ queryKey: ["owner-dashboard-summary"], queryFn: () => getSummary(), enabled: Boolean(access.data), refetchInterval: 30_000 });
  const modules = MODULES.filter((module) => can(module.permission) && (!module.ownerOnly || access.data?.isManager));
  const s = summary.data;

  return (
    <div className="space-y-6">
      <PushToggle />
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Today</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {canSeeOrders || can(["pos", "platform_sales"]) ? <SummaryLink to="/owner/orders" search={{ date: s?.today }} label="Sales" value={formatBDT(s?.todaySales ?? 0)} /> : null}
          {canSeeOrders ? <SummaryLink to="/owner/orders" search={{ activeOnline: true }} label="Active orders" value={String(s?.activeOnlineOrders ?? 0)} /> : null}
          {can("inventory") ? <SummaryLink to="/owner/inventory" label="Low stock" value={String(s?.inventory.lowStock ?? 0)} /> : null}
          {can("purchases") ? <SummaryLink to="/owner/purchases" search={{ date: s?.today }} label="Expenses" value={formatBDT(s?.todayExpenses ?? 0)} /> : null}
        </div>
        {summary.isLoading ? <Skeleton className="mt-3 h-24 w-full" /> : null}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-black">Your workspace</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {modules.map((module) => (
            <Link key={module.to} to={module.to as never} className={module.prominent ? "min-h-28 rounded-lg border border-primary/40 bg-card p-4 shadow-ember transition-colors hover:bg-muted" : "min-h-24 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"}>
              <module.icon className="size-5 text-primary" aria-hidden="true" />
              <span className="mt-3 block font-display font-bold">{module.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{module.description}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryLink({ to, search, label, value }: { to: "/owner/orders" | "/owner/purchases" | "/owner/inventory"; search?: Record<string, string | boolean | undefined>; label: string; value: string }) {
  return <Link to={to} search={search ?? {}} className="rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:bg-muted"><p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p><p className="mt-1 font-display text-lg font-bold">{value}</p></Link>;
}