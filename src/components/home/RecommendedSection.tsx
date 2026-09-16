import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ProductCard } from "@/components/menu/ProductCard";
import { useAuth } from "@/hooks/use-auth";
import { getRecommendations } from "@/lib/recommendations.functions";
import type { Product } from "@/types/menu";

/**
 * "Recommended for You" — presentation only. The server returns product IDs;
 * every price, option and availability flag comes from the live menu list
 * already loaded on the page.
 */
export function RecommendedSection({ products }: { products: Product[] }) {
  const { user, loading } = useAuth();
  const fetchRecommendations = useServerFn(getRecommendations);

  const { data } = useQuery({
    queryKey: ["recommendations", user?.id ?? "guest"],
    queryFn: () => fetchRecommendations(),
    enabled: !loading,
    staleTime: 60 * 1000,
  });

  if (!data?.enabled) return null;

  const byId = new Map(products.filter((p) => p.isAvailable).map((p) => [p.id, p] as const));
  const pick = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));

  const orderAgain = pick(data.orderAgain);
  const tryNew = pick(data.tryNew);

  if (orderAgain.length === 0 && tryNew.length === 0) return null;

  return (
    <section
      aria-labelledby="recommended-heading"
      className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6"
    >
      <h2 id="recommended-heading" className="font-display text-xl font-extrabold sm:text-2xl">
        Recommended for You
      </h2>

      {orderAgain.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-muted-foreground">Order again</p>
          <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {orderAgain.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}

      {tryNew.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-muted-foreground">
            {orderAgain.length > 0 ? "Try something new" : "Popular picks for you"}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {tryNew.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
