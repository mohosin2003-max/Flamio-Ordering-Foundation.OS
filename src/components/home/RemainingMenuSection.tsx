import { ProductCard } from "@/components/menu/ProductCard";
import type { Category, Product } from "@/types/menu";

/**
 * "Explore the full menu" — shows every available product that is NOT already
 * displayed elsewhere on the Home Page (carousel/Featured, Popular showcase,
 * Offers, or Recommended for You), grouped by its existing category.
 * Presentation only; reuses live menu data and ProductCard.
 */
export function RemainingMenuSection({
  products,
  categories,
  excludedIds,
}: {
  products: Product[];
  categories: Category[];
  /** IDs already rendered in Featured or Recommended on the Home Page. */
  excludedIds: Set<string>;
}) {
  const visibleCategories = categories.filter((c) => c.isVisible);
  const groups = visibleCategories
    .map((category) => ({
      category,
      items: products.filter(
        (p) => p.categoryId === category.id && p.isAvailable && !excludedIds.has(p.id),
      ),
    }))
    .filter((group) => group.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <section
      aria-labelledby="more-menu-heading"
      className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6"
    >
      <h2 id="more-menu-heading" className="font-display text-xl font-extrabold sm:text-2xl">
        All Menu
      </h2>
      <div className="mt-6 space-y-8">
        {groups.map(({ category, items }) => (
          <div key={category.id}>
            <h3 className="text-base font-bold text-foreground">{category.name}</h3>
            <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
