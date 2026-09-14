import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { CartLine, Product, ProductVariant } from "@/types/menu";

const STORAGE_KEY = "flamio.cart.v1";

interface CartContextValue {
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
  total: number;
  isHydrated: boolean;
  addItem: (product: Product, variant: ProductVariant | null, quantity?: number) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  increment: (lineId: string) => void;
  decrement: (lineId: string) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function readStorage(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setLines(readStorage());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* storage unavailable – cart still works for this session */
    }
  }, [lines, isHydrated]);

  const addItem = useCallback(
    (product: Product, variant: ProductVariant | null, quantity = 1) => {
      const lineId = `${product.id}::${variant?.id ?? "base"}`;
      const image = product.images.find((i) => i.isPrimary) ?? product.images[0];
      setLines((current) => {
        const existing = current.find((l) => l.lineId === lineId);
        if (existing) {
          return current.map((l) =>
            l.lineId === lineId ? { ...l, quantity: l.quantity + quantity } : l,
          );
        }
        return [
          ...current,
          {
            lineId,
            productId: product.id,
            productName: product.name,
            productSlug: product.slug,
            variantId: variant?.id ?? null,
            variantName: variant?.name ?? null,
            unitPrice: variant?.price ?? product.basePrice,
            quantity,
            imageUrl: image?.url ?? null,
          },
        ];
      });
    },
    [],
  );

  const setQuantity = useCallback((lineId: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((l) => l.lineId !== lineId)
        : current.map((l) => (l.lineId === lineId ? { ...l, quantity } : l)),
    );
  }, []);

  const increment = useCallback(
    (lineId: string) =>
      setLines((c) => c.map((l) => (l.lineId === lineId ? { ...l, quantity: l.quantity + 1 } : l))),
    [],
  );

  const decrement = useCallback(
    (lineId: string) =>
      setLines((c) =>
        c.flatMap((l) =>
          l.lineId === lineId
            ? l.quantity <= 1
              ? []
              : [{ ...l, quantity: l.quantity - 1 }]
            : [l],
        ),
      ),
    [],
  );

  const removeItem = useCallback(
    (lineId: string) => setLines((c) => c.filter((l) => l.lineId !== lineId)),
    [],
  );

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    return {
      lines,
      itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
      subtotal,
      // Delivery fees / discounts arrive in a later phase.
      total: subtotal,
      isHydrated,
      addItem,
      setQuantity,
      increment,
      decrement,
      removeItem,
      clear,
    };
  }, [lines, isHydrated, addItem, setQuantity, increment, decrement, removeItem, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
