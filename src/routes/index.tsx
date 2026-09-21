import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { HomeCarousel } from "@/components/home/HomeCarousel";
import { LocationSection } from "@/components/home/LocationSection";
import { RecommendedSection } from "@/components/home/RecommendedSection";
import { RemainingMenuSection } from "@/components/home/RemainingMenuSection";
import { ProductCard } from "@/components/menu/ProductCard";
import { useAuth } from "@/hooks/use-auth";
import { menuQueryOptions, restaurantQueryOptions } from "@/lib/menu-repository";
import { getRecommendations } from "@/lib/recommendations.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flamio — Flame-Grilled Burgers, Pizza & Meat Boxes in Kishoreganj" },
      {
        name: "description",
        content:
          "Order flame-grilled burgers, meat boxes, stone-baked pizza, pasta and shawarma from Flamio in Kishoreganj Sadar, Gurudayal College.",
      },
      { property: "og:title", content: "Flamio — Flame-Grilled Food in Kishoreganj" },
      {
        property: "og:description",
        content: "Burgers, meat boxes, pizza, pasta and shawarma cooked to order at Flamio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(menuQueryOptions());
    context.queryClient.ensureQueryData(restaurantQueryOptions());
  },
  component: HomePage,
});

function HomePage() {
  const { data: menu } = useSuspenseQuery(menuQueryOptions());
  const { data: info } = useSuspenseQuery(restaurantQueryOptions());
  const { user, loading } = useAuth();
  const fetchRecommendations = useServerFn(getRecommendations);
  const { data: recommendations } = useQuery({
    queryKey: ["recommendations", user?.id ?? "guest"],
    queryFn: () => fetchRecommendations(),
    enabled: !loading,
    staleTime: 60 * 1000,
  });

  const featured = menu.products.filter((p) => p.isFeatured);
  const popular = menu.products.filter((p) => p.isPopular);
  const carouselProducts = (featured.length ? featured : popular.length ? popular : menu.products).slice(0, 5);
  const featuredProducts = menu.products
    .filter((product) => product.isAvailable && (product.isFeatured || product.isPopular))
    .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.sortOrder - b.sortOrder);
  const featuredIds = new Set(featuredProducts.map((product) => product.id));
  const recommendationIds = new Set<string>();
  if (recommendations?.enabled) {
    for (const id of [...recommendations.orderAgain, ...recommendations.tryNew]) {
      if (!featuredIds.has(id)) recommendationIds.add(id);
    }
  }
  const excludedIds = new Set([...featuredIds, ...recommendationIds]);

  return (
    <>
      <HomeCarousel banners={info.banners} products={carouselProducts} />

      <section
        aria-labelledby="categories-heading"
        className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6"
      >
        <div className="flex items-end justify-between gap-4">
          <h2 id="categories-heading" className="font-display text-xl font-extrabold sm:text-2xl">
            Categories
          </h2>
          <Link
            to="/menu"
            search={{}}
            className="text-sm font-medium text-primary transition-smooth hover:opacity-80"
          >
            See all
          </Link>
        </div>
        <ul className="mt-4 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {menu.categories.map((category) => (
            <li key={category.id} className="w-32 shrink-0 sm:w-40">
              <Link
                to="/menu"
                search={{ category: category.slug }}
                className="group block overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card"
              >
                <span className="block aspect-[4/3] overflow-hidden">
                  {category.imageUrl ? (
                    <img
                      src={category.imageUrl}
                      alt={category.name}
                      loading="lazy"
                      className="size-full object-cover opacity-80 transition-smooth group-hover:scale-105"
                    />
                  ) : (
                    <span className="block size-full bg-muted" />
                  )}
                </span>
                <span className="block truncate p-2 text-center text-sm font-semibold">
                  {category.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {featuredProducts.length > 0 && (
        <section
          aria-labelledby="featured-heading"
          className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6"
        >
          <div className="flex items-end justify-between gap-4">
            <h2 id="featured-heading" className="font-display text-xl font-extrabold sm:text-2xl">
              Popular &amp; Offers
            </h2>
            <Link
              to="/offers"
              className="text-sm font-medium text-primary transition-smooth hover:opacity-80"
            >
              See offers
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                displayBadges={[
                  ...(product.isFeatured ? ["offer"] : []),
                  ...(product.isPopular ? ["popular"] : []),
                ]}
              />
            ))}
          </div>
        </section>
      )}

      <RecommendedSection
        products={menu.products}
        recommendations={recommendations}
        excludedIds={featuredIds}
      />

      <RemainingMenuSection
        products={menu.products}
        categories={menu.categories}
        excludedIds={excludedIds}
      />

      <div className="pt-10">
        <LocationSection restaurant={info.restaurant} />
      </div>
    </>
  );
}
