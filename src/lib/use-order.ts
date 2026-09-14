import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getOrder } from "@/lib/orders.functions";
import { findOrder, type PlacedOrder } from "@/lib/orders";

/**
 * Reads an order from the database (source of truth) and falls back to the
 * local copy saved at checkout so the page still works offline.
 */
export function useOrder(orderId: string) {
  const fetchOrder = useServerFn(getOrder);

  const query = useQuery({
    queryKey: ["order", orderId],
    queryFn: async (): Promise<PlacedOrder | null> => {
      const row = await fetchOrder({ data: { orderId } });
      if (!row) return null;
      return {
        id: row.id,
        code: row.code,
        createdAt: row.createdAt,
        fulfillment: row.fulfillment,
        paymentMethod: row.paymentMethod as PlacedOrder["paymentMethod"],
        paymentLabel: row.paymentLabel,
        items: row.items.map((i) => ({
          lineId: i.lineId,
          productId: i.productId,
          productName: i.productName,
          productSlug: i.productSlug,
          variantId: i.variantId,
          variantName: i.variantName,
          unitPrice: i.unitPrice,
          quantity: i.quantity,
          imageUrl: i.imageUrl,
        })),
        subtotal: row.subtotal,
        discount: row.discount,
        deliveryCharge: row.deliveryCharge,
        total: row.total,
        estimatedTime: row.estimatedTime,
        zoneName: row.zoneName,
        pickupNote: row.pickupNote,
        status: row.status,
        address: {
          id: row.id,
          label: null,
          fullName: row.customerName,
          phone: row.customerPhone,
          addressLine: row.addressLine ?? "",
          area: row.area,
          zoneId: null,
          landmark: row.landmark,
          deliveryNotes: row.deliveryNotes,
          isDefault: false,
          latitude: null,
          longitude: null,
        },
      };
    },
    retry: 1,
    staleTime: 15 * 1000,
    // Keep the status fresh while the order is still being processed.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && status !== "completed" && status !== "cancelled" ? 20 * 1000 : false;
    },
  });

  const fallback = typeof window !== "undefined" ? findOrder(orderId) : null;
  const order = query.data ?? (query.isError ? fallback : (query.data === null ? fallback : null));

  return {
    order: order ?? null,
    ready: !query.isPending,
    error: query.isError && !fallback ? query.error : null,
    refreshing: query.isFetching,
    refresh: () => void query.refetch(),
  };
}
