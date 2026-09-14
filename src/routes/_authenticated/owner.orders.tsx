import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
import { ownerListOrders, ownerUpdateOrderStatus } from "@/lib/owner.functions";
import { ownerAssignRider, ownerListRiders } from "@/lib/riders.functions";
import { formatBDT } from "@/lib/format";
import { statusLabel } from "@/lib/order-status";

export const Route = createFileRoute("/_authenticated/owner/orders")({
  component: OwnerOrders,
});

const STATUSES = [
  "placed",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
] as const;

function OwnerOrders() {
  const listOrders = useServerFn(ownerListOrders);
  const updateStatus = useServerFn(ownerUpdateOrderStatus);
  const listRiders = useServerFn(ownerListRiders);
  const assignRider = useServerFn(ownerAssignRider);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [riderPending, setRiderPending] = useState<string | null>(null);

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

            <div className="flex flex-wrap items-center gap-2">
              <Badge>{statusLabel(order.status, order.fulfillment)}</Badge>
              <Select
                value={order.status}
                disabled={pending === order.id}
                onValueChange={async (value) => {
                  setPending(order.id);
                  try {
                    await updateStatus({
                      data: { orderId: order.id, status: value as (typeof STATUSES)[number] },
                    });
                    await queryClient.invalidateQueries({ queryKey: ["owner-orders"] });
                    toast.success("Order updated");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Couldn't update this order",
                    );
                  } finally {
                    setPending(null);
                  }
                }}
              >
                <SelectTrigger className="h-9 w-[190px]">
                  <SelectValue placeholder="Update status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {statusLabel(status, order.fulfillment)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {order.fulfillment === "delivery" ? (
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
