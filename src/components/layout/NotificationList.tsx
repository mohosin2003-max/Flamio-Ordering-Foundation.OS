import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { CustomerNotification } from "@/lib/customer.functions";
import { cn } from "@/lib/utils";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationList({
  notifications,
  isLoading,
  error,
  onOpen,
  onAfterNavigate,
}: {
  notifications: CustomerNotification[];
  isLoading: boolean;
  error: string | null;
  onOpen: (notification: CustomerNotification) => void;
  onAfterNavigate?: () => void;
}) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        <span className="sr-only">Loading notifications</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="m-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (notifications.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        No notifications yet. Order updates will appear here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/70">
      {notifications.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={async () => {
              onOpen(n);
              if (n.orderId) {
                await navigate({ to: "/order/$orderId", params: { orderId: n.orderId } });
                onAfterNavigate?.();
              }
            }}
            className={cn(
              "flex w-full flex-col gap-1 px-4 py-3 text-left transition-smooth hover:bg-secondary/60",
              !n.isRead && "bg-secondary/40",
            )}
          >
            <span className="flex items-start justify-between gap-3">
              <span
                className={cn(
                  "text-sm leading-snug",
                  n.isRead ? "font-medium text-foreground" : "font-bold text-foreground",
                )}
              >
                {!n.isRead ? (
                  <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle" />
                ) : null}
                {n.title}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {relativeTime(n.createdAt)}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">{n.body}</span>
            {n.orderCode ? (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                {n.orderCode}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function MarkAllReadButton({
  onClick,
  disabled,
  pending,
}: {
  onClick: () => void;
  disabled: boolean;
  pending: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-smooth disabled:opacity-50"
    >
      {pending ? <Loader2 aria-hidden="true" className="size-3 animate-spin" /> : null}
      Mark all read
    </button>
  );
}
