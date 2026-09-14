import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBDT } from "@/lib/format";
import { placeholderByCategorySlug } from "@/lib/menu-repository";
import { placeOrder } from "@/lib/orders.functions";
import { ownerGetCatalog } from "@/lib/owner.functions";

/**
 * Counter (POS) sales. This is a thin till on top of the EXISTING order
 * architecture: it calls the same `placeOrder` server function as checkout, so
 * the sale lands in the existing orders table, appears in the existing Kitchen
 * queue and consumes ingredients through the existing inventory logic
 * (Advanced mode). No separate POS order or inventory system.
 */
export const Route = createFileRoute("/_authenticated/owner/pos")({
  component: OwnerPos,
});

function OwnerPos() {
  const getCatalog = useServerFn(ownerGetCatalog);
  const submitOrder = useServerFn(placeOrder);
  const queryClient = useQueryClient();

  const [lines, setLines] = useState<Record<string, number>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("Walk-in customer");
  const [customerPhone, setCustomerPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const catalog = useQuery({
    queryKey: ["owner-catalog"],
    queryFn: () => getCatalog(),
  });

  const products = (catalog.data?.products ?? []).filter((p) => p.isAvailable);
  const categories = catalog.data?.categories ?? [];

  const total = useMemo(
    () =>
      products.reduce((sum, product) => sum + product.basePrice * (lines[product.id] ?? 0), 0),
    [products, lines],
  );
  const itemCount = Object.values(lines).reduce((sum, n) => sum + n, 0);

  if (catalog.isLoading) return <Skeleton className="h-96 w-full" />;

  if (catalog.error) {
    return (
      <EmptyState
        title="Couldn't load the menu"
        description="Please try again."
        action={<Button onClick={() => void catalog.refetch()}>Try again</Button>}
      />
    );
  }

  const bump = (id: string, delta: number) =>
    setLines((prev) => {
      const next = Math.max((prev[id] ?? 0) + delta, 0);
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  const charge = async () => {
    const selected = products.filter((p) => (lines[p.id] ?? 0) > 0);
    if (selected.length === 0) {
      toast.error("Add at least one item to the sale.");
      return;
    }
    setSaving(true);
    try {
      const result = await submitOrder({
        data: {
          fulfillment: "pickup",
          paymentMethod: "cash",
          paymentLabel: "Cash at counter (POS)",
          customerName: customerName.trim() || "Walk-in customer",
          customerPhone: customerPhone.trim() || "000000",
          addressLine: null,
          area: null,
          landmark: null,
          deliveryNotes: null,
          zoneId: null,
          zoneName: null,
          estimatedTime: null,
          pickupNote: "Counter sale",
          subtotal: total,
          discount: 0,
          deliveryCharge: 0,
          total,
          items: selected.map((p) => ({
            productId: p.id,
            productSlug: p.slug,
            productName: p.name,
            variantId: null,
            variantName: null,
            unitPrice: p.basePrice,
            quantity: lines[p.id] ?? 1,
            imageUrl: p.imageUrl,
          })),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["owner-inventory"] });
      setLines({});
      setCustomerPhone("");
      toast.success(`Sale recorded — ${result.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't record this sale");
    } finally {
      setSaving(false);
    }
  };

  const visibleCategories = categories.filter((c) =>
    products.some((p) => p.categoryId === c.id),
  );
  const selectedCategory = activeCategory ?? visibleCategories[0]?.id ?? null;
  const visibleProducts = products.filter((p) => p.categoryId === selectedCategory);

  return (
    <div className="space-y-5">
      {products.length === 0 ? (
        <EmptyState
          title="No items available"
          description="Make menu items available to sell them at the counter."
        />
      ) : (
        <>
          {/* Category switcher — existing categories, horizontal scroll on mobile */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {visibleCategories.map((category) => (
              <Button
                key={category.id}
                size="sm"
                variant={category.id === selectedCategory ? "default" : "outline"}
                className="shrink-0"
                onClick={() => setActiveCategory(category.id)}
              >
                {category.name}
              </Button>
            ))}
          </div>

          {/* Visual product grid — same catalog data/images as the customer menu */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {visibleProducts.map((product) => {
              const qty = lines[product.id] ?? 0;
              const categorySlug =
                categories.find((c) => c.id === product.categoryId)?.slug ?? "";
              const imageUrl =
                product.imageUrl ?? placeholderByCategorySlug[categorySlug] ?? null;
              return (
                <Card key={product.id} className="overflow-hidden">
                  <button
                    type="button"
                    className="block w-full text-left"
                    aria-label={`Add one ${product.name}`}
                    onClick={() => bump(product.id, 1)}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={product.name}
                        className="aspect-[4/3] w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid aspect-[4/3] w-full place-items-center bg-muted text-2xl font-bold text-muted-foreground">
                        {product.name.charAt(0)}
                      </div>
                    )}
                    <div className="space-y-0.5 p-2.5">
                      <p className="truncate text-sm font-semibold">{product.name}</p>
                      <p className="text-sm font-bold text-primary">
                        {formatBDT(product.basePrice)}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
                    {qty > 0 ? (
                      <>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-9 w-9 shrink-0"
                          aria-label={`Remove one ${product.name}`}
                          onClick={() => bump(product.id, -1)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="text-sm font-semibold">{qty}</span>
                        <Button
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          aria-label={`Add one ${product.name}`}
                          onClick={() => bump(product.id, 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        className="h-9 w-full"
                        aria-label={`Add one ${product.name}`}
                        onClick={() => bump(product.id, 1)}
                      >
                        <Plus className="mr-1 h-4 w-4" /> Add
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pos-name">Customer name</Label>
              <Input
                id="pos-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pos-phone">Phone (optional)</Label>
              <Input
                id="pos-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{itemCount} items</Badge>
              <span className="text-sm text-muted-foreground">Cash sale</span>
            </div>
            <span className="font-display text-lg font-bold">{formatBDT(total)}</span>
          </div>
          <Button disabled={saving} onClick={() => void charge()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Take payment &amp; send to kitchen
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
