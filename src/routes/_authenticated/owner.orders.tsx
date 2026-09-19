import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ChevronRight, MessageCircle, Phone, XCircle } from "lucide-react";
import { toast } from "sonner";

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
import { OrderMessages } from "@/components/order/OrderMessages";
import { ownerListOrders, ownerUpdateOrderStatus, type OwnerOrderRow } from "@/lib/owner.functions";
import { ownerAssignRider, ownerListRiders } from "@/lib/riders.functions";
import { formatBDT } from "@/lib/format";
import { statusLabel } from "@/lib/order-status";
import {
  canCancelOrder,
  channelLabel,
  isOnlineChannel,
  nextActionLabel,
  nextOrderStatus,
} from "@/lib/order-flow";

export const Route = createFileRoute("/_authenticated/owner/orders")({
  validateSearch: (search: Record<string, unknown>) => ({
    order: typeof search.order === "string" ? search.order : undefined,
  }),
  component: OwnerOrders,
});

function OwnerOrders() {
  const { order: focusOrderId } = Route.useSearch();
  const listOrders = useServerFn(ownerListOrders);
  const listRiders = useServerFn(ownerListRiders);
  const assignRider = useServerFn(ownerAssignRider);
  const queryClient = useQueryClient();
  const [riderPending, setRiderPending] = useState<string | null>(null);
  const [openThread, setOpenThread] = useState<string | null>(focusOrderId ?? null);

  useEffect(() => {
    if (focusOrderId) setOpenThread(focusOrderId);
  }, [focusOrderId]);

  const orders = useQuery({
    queryKey: ["owner-orders"],
    queryFn: () => listOrders(),
    refetchInterval: 20_000,
  });

  const riders = useQuery({
    queryKey: ["owner-riders"],
    queryFn: () => listRiders(),
  });

  const activeRiders = (riders.data ?? []).filter((r) => r.isActive);

  if (orders.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
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

  return (
    <div className="space-y-3">
      {orders.data.map((order) => (
        <Card key={order.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-all font-semibold">{order.code}</p>
                <p className="text-sm text-muted-foreground">
                  {order.customerName} · {order.customerPhone}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(order.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display font-bold">{formatBDT(order.total)}</p>
                <Badge variant="secondary" className="mt-1 capitalize">
                  {order.fulfillment}
                </Badge>
              </div>
            </div>

            {order.addressLine ? (
              <p className="text-sm text-muted-foreground">
                {order.addressLine}
                {order.area ? `, ${order.area}` : ""}
              </p>
            ) : null}

            <StatusRow order={order} />

            {isOnlineChannel(order.channel) ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={`tel:${order.customerPhone}`}>
                    <Phone aria-hidden="true" /> Call customer
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant={order.unreadMessages > 0 ? "default" : "outline"}
                  onClick={() => setOpenThread((id) => (id === order.id ? null : order.id))}
                  aria-expanded={openThread === order.id}
                >
                  <MessageCircle aria-hidden="true" />
                  Messages
                  {order.unreadMessages > 0 ? ` (${order.unreadMessages})` : ""}
                </Button>
              </div>
            ) : null}

            {openThread === order.id ? (
              <div className="rounded-xl border border-border/70 bg-secondary/30 p-3">
                <OrderMessages orderId={order.id} autoFocus={focusOrderId === order.id} />
              </div>
            ) : null}

            {order.fulfillment === "delivery" && isOnlineChannel(order.channel) ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Rider</span>
                <Select
                  value={order.riderId ?? "none"}
                  disabled={riderPending === order.id}
                  onValueChange={async (value) => {
                    setRiderPending(order.id);
                    try {
                      await assignRider({
                        data: { orderId: order.id, riderId: value === "none" ? null : value },
                      });
                      await queryClient.invalidateQueries({ queryKey: ["owner-orders"] });
                      toast.success(value === "none" ? "Rider cleared" : "Rider assigned");
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "Couldn't assign this rider",
                      );
                    } finally {
                      setRiderPending(null);
                    }
                  }}
                >
                  <SelectTrigger className="h-9 w-[190px]">
                    <SelectValue placeholder="Assign rider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No rider</SelectItem>
                    {activeRiders.map((rider) => (
                      <SelectItem key={rider.id} value={rider.id}>
                        {rider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeRiders.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Add riders in the Riders tab
                  </span>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Current status plus the single appropriate next step. Status is forward-only,
 * so there is no status list and no way back; cancelling is a separate action.
 */
function StatusRow({ order }: { order: OwnerOrderRow }) {
  const updateStatus = useServerFn(ownerUpdateOrderStatus);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const counterSale = !isOnlineChannel(order.channel);
  const next = counterSale ? null : nextOrderStatus(order.status, order.fulfillment);
  const cancellable = canCancelOrder(order.status, order.channel);

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
    <div className="flex flex-wrap items-center gap-2">
      <Badge>{statusLabel(order.status, order.fulfillment)}</Badge>
      {counterSale ? (
        <span className="text-xs text-muted-foreground">
          {channelLabel(order.channel)} — completed sale
        </span>
      ) : (
        <>
          {next ? (
            <Button size="sm" disabled={pending} onClick={() => void move(next)}>
              {nextActionLabel(next, order.fulfillment)}
              <ChevronRight aria-hidden="true" />
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">No further steps</span>
          )}
          {cancellable ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Cancel order ${order.code}? This can't be undone.`)) {
                  void move("cancelled");
                }
              }}
            >
              <XCircle aria-hidden="true" /> Cancel
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
