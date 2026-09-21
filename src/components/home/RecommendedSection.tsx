import { ProductCard } from "@/components/menu/ProductCard";
import type { Recommendations } from "@/lib/recommendations.functions";
import type { Product } from "@/types/menu";

/**
 * "Recommended for You" — presentation only. The server returns product IDs;
 * every price, option and availability flag comes from the live menu list
 * already loaded on the page.
 */
export function RecommendedSection({
  products,
  recommendations,
  excludedIds,
}: {
  products: Product[];
  recommendations: Recommendations | undefined;
  excludedIds: Set<string>;
}) {
  if (!recommendations?.enabled) return null;

  const byId = new Map(
    products
      .filter((p) => p.isAvailable && !excludedIds.has(p.id))
      .map((p) => [p.id, p] as const),
  );
  const pick = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));

  const orderAgain = pick(recommendations.orderAgain);
  const orderAgainIds = new Set(orderAgain.map((product) => product.id));
  const tryNew = pick(recommendations.tryNew).filter((product) => !orderAgainIds.has(product.id));

  if (orderAgain.length === 0 && tryNew.length === 0) return null;

  return (
    <section
      aria-labelledby="recommended-heading"
      className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6"
    >
      <h2 id="recommended-heading" className="font-display text-xl font-extrabold sm:text-2xl">
        Recommended for You
      </h2>

      <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {orderAgain.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-muted-foreground">Order again</p>
          <div className="mt-3 flex gap-3">
            {orderAgain.map((product) => (
              <div key={product.id} className="w-44 shrink-0 snap-start sm:w-48">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tryNew.length > 0 && (
        <div className={orderAgain.length > 0 ? "mt-4" : "mt-4"}>
          <p className="text-sm font-semibold text-muted-foreground">
            {orderAgain.length > 0 ? "Try something new" : "Popular picks for you"}
          </p>
          <div className="mt-3 flex gap-3">
            {tryNew.map((product) => (
              <div key={product.id} className="w-44 shrink-0 snap-start sm:w-48">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </section>
  );
}
