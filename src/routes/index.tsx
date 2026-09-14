import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { HomeCarousel } from "@/components/home/HomeCarousel";
import { LocationSection } from "@/components/home/LocationSection";
import { PromoBannerArea } from "@/components/home/PromoBannerArea";
import { ProductCard } from "@/components/menu/ProductCard";
import { menuQueryOptions, restaurantQueryOptions } from "@/lib/menu-repository";

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

  const featured = menu.products.filter((p) => p.isFeatured);
  const popular = menu.products.filter((p) => p.isPopular);
  const carouselProducts = (featured.length ? featured : popular.length ? popular : menu.products).slice(0, 5);
  const showcase = (popular.length ? popular : menu.products).slice(0, 8);

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

      {showcase.length > 0 && (
        <section
          aria-labelledby="popular-heading"
          className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6"
        >
          <div className="flex items-end justify-between gap-4">
            <h2 id="popular-heading" className="font-display text-xl font-extrabold sm:text-2xl">
              Popular
            </h2>
            <Link
              to="/menu"
              search={{}}
              className="text-sm font-medium text-primary transition-smooth hover:opacity-80"
            >
              Full menu
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {showcase.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="offers-heading" className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <h2 id="offers-heading" className="font-display text-xl font-extrabold sm:text-2xl">
            Offers
          </h2>
          <Link
            to="/offers"
            className="text-sm font-medium text-primary transition-smooth hover:opacity-80"
          >
            See offers
          </Link>
        </div>
        <div className="mt-4">
          {info.banners.length > 0 ? (
            <PromoBannerArea banners={info.banners} />
          ) : featured.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {featured.slice(0, 4).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No offers running right now.</p>
          )}
        </div>
      </section>

      <div className="pt-10">
        <LocationSection restaurant={info.restaurant} />
      </div>
    </>
  );
}
