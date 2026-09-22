import { ImageIcon, StickyNote } from "lucide-react";
import { useId } from "react";

import { formatBDT } from "@/lib/format";

export interface StaffOrderItem {
  name: string;
  variantName: string | null;
  quantity: number;
  unitPrice?: number | null;
  imageUrl?: string | null;
  comboName?: string | null;
}

export function CustomerNote({ note }: { note: string | null | undefined }) {
  if (!note?.trim()) return null;

  return (
    <section className="rounded-lg border border-primary/35 bg-primary/10 p-3" aria-label="Customer note">
      <p className="flex items-center gap-2 text-xs font-bold uppercase text-primary">
        <StickyNote className="size-4" aria-hidden="true" /> Customer note
      </p>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm font-medium text-foreground">
        {note}
      </p>
    </section>
  );
}

export function StaffOrderItemList({
  items,
  showPrices = false,
}: {
  items: StaffOrderItem[];
  showPrices?: boolean;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="text-xs font-bold uppercase text-muted-foreground">
        Order items
      </h3>
      <ul className="mt-2 divide-y divide-border/70 rounded-lg border border-border/70 bg-background/40">
        {items.map((item, index) => (
          <li
            key={`${item.name}-${item.variantName ?? "standard"}-${index}`}
            className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 p-3"
          >
            <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="size-full object-cover"
                  loading="lazy"
                />
              ) : (
                <ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <p className="break-words text-sm font-bold text-foreground">{item.name}</p>
              {item.variantName || item.comboName ? (
                <p className="mt-0.5 break-words text-xs text-muted-foreground">
                  {[item.variantName, item.comboName].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              {showPrices && item.unitPrice != null ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatBDT(item.unitPrice)} each
                </p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <span className="inline-flex min-w-10 justify-center rounded-md bg-secondary px-2 py-1 text-base font-black text-primary">
                {item.quantity}×
              </span>
              {showPrices && item.unitPrice != null ? (
                <p className="mt-1 text-xs font-bold">{formatBDT(item.unitPrice * item.quantity)}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function orderDateParts(iso: string) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return { date: "", time: "" };
  return {
    date: value.toLocaleDateString("en-GB", {
      timeZone: "Asia/Dhaka",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    time: value.toLocaleTimeString("en-GB", {
      timeZone: "Asia/Dhaka",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}