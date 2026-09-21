# Clean Flamio menu organization

## Scope
- Preserve the existing Home banner, category strip, product cards, menu data, cart actions, routes, and owner controls.
- Reorganize only the Home menu content after Categories into: **Popular & Offers**, compact **Recommended for You** when meaningful, then the category-ordered remaining menu.
- Do not change the dedicated `/menu` page, Owner Dashboard, database, or unrelated pages.

## Implementation
1. In the Home page, derive one unique Featured list from available products already marked `isFeatured` (current offer/special control) or `isPopular`, with offers first and existing sort order retained.
2. Reuse `ProductCard` in one compact **Popular & Offers** grid. Add only presentation-level badge inputs so Featured cards can distinguish **Offer** and **Popular** without changing product records.
3. Update `RecommendedSection` to accept excluded Featured IDs, keep the existing recommendation service and customer-history logic, remove overlaps, and present remaining recommendations as a compact horizontal row using live product data and existing interactions.
4. Update `RemainingMenuSection` to exclude Featured and actually rendered recommendation IDs from one shared recommendation result, preserving category order and showing every other available product exactly once.
5. Keep the existing carousel behavior unchanged; carousel slides are treated as the banner rather than another menu list.

## Technical details
- Fetch recommendations once in the Home page and pass the result down, avoiding two independent requests and ensuring all three sections use one exclusion set.
- No migrations, new records, new owner settings, or hardcoded products.
- Existing `isFeatured`, `isPopular`, promo-banner activation filtering, product IDs, category IDs, prices, images, variants, and availability remain authoritative.

## Verification
- Confirm the banner and category strip are visually unchanged.
- Check Featured ordering, offer/popular badges, empty-state hiding, and dual-designated product deduplication.
- Check recommendations hide when empty and never overlap Featured.
- Assert each rendered menu product card appears once across Featured, Recommended, and remaining categories, while every available product remains reachable.
- Exercise product details and add-to-cart on mobile and desktop; check overflow, diagnostics, typecheck, and production build.