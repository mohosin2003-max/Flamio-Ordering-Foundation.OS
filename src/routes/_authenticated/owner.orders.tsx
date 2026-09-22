import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  MapPin,
  MessageCircle,
  Phone,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { OrderMessages } from "@/components/order/OrderMessages";
import { CustomerNote, StaffOrderItemList, orderDateParts } from "@/components/order/StaffOrderDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboardAccess } from "@/hooks/use-dashboard-access";
import { formatBDT } from "@/lib/format";
import {
  canCancelOrder,
  channelLabel,
  isOnlineChannel,
  nextActionLabel,
  nextOrderStatus,
} from "@/lib/order-flow";
import { statusLabel } from "@/lib/order-status";
import { ownerListOrders, ownerUpdateOrderStatus, type OwnerOrderRow } from "@/lib/owner.functions";
import { hasPermission } from "@/lib/permissions";
import { ownerAssignRider, ownerListRiders } from "@/lib/riders.functions";

export const Route = createFileRoute("/_authenticated/owner/orders")({
  validateSearch: (search: Record<string, unknown>): { order?: string; date?: string; activeOnline?: boolean } => {
    const parsed: { order?: string; date?: string; activeOnline?: boolean } = {};
    if (typeof search["order"] === "string") parsed.order = search["order"];
    if (typeof search["date"] === "string") parsed.date = search["date"];
    if (search["activeOnline"] === true || search["activeOnline"] === "true") parsed.activeOnline = true;
    return parsed;
  },
  head: () => ({
    meta: [
      { title: "Orders — Flamio Owner Dashboard" },
      { name: "description", content: "Review and process Flamio restaurant orders." },
      { property: "og:title", content: "Orders — Flamio Owner Dashboard" },
      { property: "og:description", content: "Review and process Flamio restaurant orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OwnerOrders,
});

function OwnerOrders() {
  const { order: focusOrderId, date, activeOnline } = Route.useSearch();
  const listOrders = useServerFn(ownerListOrders);
  const listRiders = useServerFn(ownerListRiders);
  const assignRider = useServerFn(ownerAssignRider);
  const queryClient = useQueryClient();
  const access = useDashboardAccess();
  const [riderPending, setRiderPending] = useState<string | null>(null);
  const [openOrder, setOpenOrder] = useState<string | null>(focusOrderId ?? null);
  const [openThread, setOpenThread] = useState<string | null>(focusOrderId ?? null);

  useEffect(() => {
    if (focusOrderId) {
      setOpenOrder(focusOrderId);
      setOpenThread(focusOrderId);
    }
  }, [focusOrderId]);

  const orders = useQuery({
    queryKey: ["owner-orders"],
    queryFn: () => listOrders(),
    refetchInterval: 20_000,
  });

  const riders = useQuery({
    queryKey: ["owner-riders"],
    queryFn: () => listRiders(),
    enabled: hasPermission(access.data, "order_management"),
  });

  const canManage = hasPermission(access.data, "order_management");
  const activeRiders = (riders.data ?? []).filter((rider) => rider.isActive);

  if (orders.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (orders.error) {
    return (
      <EmptyState
        title="Couldn't load orders"
        description="Please try again."
        action={<Button onClick={() => void orders.refetch()}>Retry</Button>}
      />
    );
  }

  if (!orders.data?.length) {
    return <EmptyState title="No orders yet" description="New orders will appear here." />;
  }

  const shownOrders = orders.data.filter((order) => {
    if (
      date &&
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(order.createdAt)) !== date
    ) return false;
    if (
      activeOnline &&
      (!isOnlineChannel(order.channel) || order.status === "completed" || order.status === "cancelled")
    ) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      {shownOrders.map((order) => {
        const expanded = openOrder === order.id;
        const { date: orderDate, time: orderTime } = orderDateParts(order.createdAt);
        const address = [order.addressLine, order.area].filter(Boolean).join(", ");

        return (
          <Card key={order.id} className="overflow-hidden">
            <CardContent className="p-0">
              <div className="p-4 sm:p-5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="break-all font-display text-base font-black text-foreground">
                        {order.code}
                      </p>
                      <Badge variant="secondary" className="shrink-0 capitalize">
                        {order.fulfillment}
                      </Badge>
                    </div>
                    <p className="mt-2 truncate text-sm font-bold">{order.customerName}</p>
                    <a className="mt-0.5 inline-block text-sm text-muted-foreground hover:text-foreground" href={`tel:${order.customerPhone}`}>
                      {order.customerPhone}
                    </a>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-lg font-black">{formatBDT(order.total)}</p>
                    <Badge className="mt-1">{statusLabel(order.status, order.fulfillment)}</Badge>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted-foreground sm:flex sm:flex-wrap">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" /> {orderDate}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Clock3 className="size-3.5 shrink-0" aria-hidden="true" /> {orderTime}
                  </span>
                  <span className="col-span-2 flex min-w-0 items-center gap-1.5 sm:max-w-md">
                    <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {order.fulfillment === "delivery" ? address || "Address unavailable" : "Restaurant pickup"}
                    </span>
                  </span>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 min-h-11 w-full sm:w-auto"
                  aria-expanded={expanded}
                  onClick={() => setOpenOrder((id) => (id === order.id ? null : order.id))}
                >
                  {expanded ? "Close Order" : "View Order"}
                  {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                </Button>
              </div>

              {expanded ? (
                <div className="space-y-5 border-t border-border/70 bg-secondary/20 p-4 sm:p-5">
                  <section aria-labelledby={`summary-${order.id}`}>
                    <h2 id={`summary-${order.id}`} className="text-xs font-bold uppercase text-muted-foreground">
                      Summary
                    </h2>
                    <dl className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-border/70 bg-background/60 p-3 text-sm sm:grid-cols-4">
                      <div className="min-w-0"><dt className="text-xs text-muted-foreground">Customer</dt><dd className="truncate font-semibold">{order.customerName}</dd></div>
                      <div className="min-w-0"><dt className="text-xs text-muted-foreground">Phone</dt><dd className="truncate font-semibold">{order.customerPhone}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Date</dt><dd className="font-semibold">{orderDate}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Time</dt><dd className="font-semibold">{orderTime}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Type</dt><dd className="font-semibold capitalize">{order.fulfillment}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Payment</dt><dd className="font-semibold">{order.paymentLabel}</dd></div>
                      <div className="col-span-2 min-w-0"><dt className="text-xs text-muted-foreground">Address</dt><dd className="break-words font-semibold">{order.fulfillment === "delivery" ? [order.addressLine, order.area, order.landmark].filter(Boolean).join(", ") || "Address unavailable" : "Restaurant pickup"}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Total</dt><dd className="font-display text-base font-black">{formatBDT(order.total)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Status</dt><dd className="font-semibold">{statusLabel(order.status, order.fulfillment)}</dd></div>
                    </dl>
                  </section>

                  <CustomerNote note={order.deliveryNotes} />
                  <StaffOrderItemList items={order.items} showPrices />

                  <OrderActions
                    order={order}
                    canManage={canManage}
                    activeRiders={activeRiders}
                    riderPending={riderPending}
                    setRiderPending={setRiderPending}
                    assignRider={assignRider}
                    queryClient={queryClient}
                    threadOpen={openThread === order.id}
                    toggleThread={() => setOpenThread((id) => (id === order.id ? null : order.id))}
                  />

                  {openThread === order.id ? (
                    <div className="rounded-lg border border-border/70 bg-background p-3">
                      <OrderMessages orderId={order.id} autoFocus={focusOrderId === order.id} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function OrderActions({
  order,
  canManage,
  activeRiders,
  riderPending,
  setRiderPending,
  assignRider,
  queryClient,
  threadOpen,
  toggleThread,
}: {
  order: OwnerOrderRow;
  canManage: boolean;
  activeRiders: { id: string; name: string }[];
  riderPending: string | null;
  setRiderPending: (id: string | null) => void;
  assignRider: (options: { data: { orderId: string; riderId: string | null } }) => Promise<unknown>;
  queryClient: ReturnType<typeof useQueryClient>;
  threadOpen: boolean;
  toggleThread: () => void;
}) {
  const updateStatus = useServerFn(ownerUpdateOrderStatus);
  const [pending, setPending] = useState(false);
  const counterSale = !isOnlineChannel(order.channel);
  const next = counterSale || !canManage ? null : nextOrderStatus(order.status, order.fulfillment);
  const cancellable = canManage && canCancelOrder(order.status, order.channel);

  const move = async (status: "cancelled" | NonNullable<typeof next>) => {
    setPending(true);
    try {
      await updateStatus({ data: { orderId: order.id, status } });
      await queryClient.invalidateQueries({ queryKey: ["owner-orders"] });
      toast.success(status === "cancelled" ? "Order cancelled" : "Order updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update this order");
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby={`actions-${order.id}`}>
      <h2 id={`actions-${order.id}`} className="text-xs font-bold uppercase text-muted-foreground">Actions</h2>

      {counterSale ? (
        <p className="mt-2 text-sm text-muted-foreground">{channelLabel(order.channel)} — completed sale</p>
      ) : next ? (
        <Button
          size="lg"
          className="mt-2 min-h-14 w-full text-base font-black shadow-ember sm:text-lg"
          disabled={pending}
          onClick={() => void move(next)}
        >
          {next === "ready" ? "READY" : nextActionLabel(next, order.fulfillment)}
          <ChevronRight aria-hidden="true" />
        </Button>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {isOnlineChannel(order.channel) ? (
          <>
            <Button asChild size="sm" variant="outline">
              <a href={`tel:${order.customerPhone}`}><Phone aria-hidden="true" /> Call Customer</a>
            </Button>
            <Button size="sm" variant={order.unreadMessages > 0 ? "default" : "outline"} onClick={toggleThread} aria-expanded={threadOpen}>
              <MessageCircle aria-hidden="true" /> Message Customer
              {order.unreadMessages > 0 ? ` (${order.unreadMessages})` : ""}
            </Button>
          </>
        ) : null}

        {cancellable ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Cancel order ${order.code}? This can't be undone.`)) void move("cancelled");
            }}
          >
            <XCircle aria-hidden="true" /> Cancel Order
          </Button>
        ) : null}
      </div>

      {canManage && order.fulfillment === "delivery" && isOnlineChannel(order.channel) ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-[auto_minmax(0,15rem)_1fr] sm:items-center">
          <span className="text-xs font-semibold text-muted-foreground">Assign Rider</span>
          <Select
            value={order.riderId ?? "none"}
            disabled={riderPending === order.id}
            onValueChange={async (value) => {
              setRiderPending(order.id);
              try {
                await assignRider({ data: { orderId: order.id, riderId: value === "none" ? null : value } });
                await queryClient.invalidateQueries({ queryKey: ["owner-orders"] });
                toast.success(value === "none" ? "Rider cleared" : "Rider assigned");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Couldn't assign this rider");
              } finally {
                setRiderPending(null);
              }
            }}
          >
            <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Assign rider" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No rider</SelectItem>
              {activeRiders.map((rider) => <SelectItem key={rider.id} value={rider.id}>{rider.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {activeRiders.length === 0 ? <span className="text-xs text-muted-foreground">Add riders in the Riders tab</span> : null}
        </div>
      ) : null}
    </section>
  );
}