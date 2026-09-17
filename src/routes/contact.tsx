import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Clock3, Facebook, Flame, MapPin } from "lucide-react";

import { restaurant } from "@/data/restaurant";
import { getPublicRestaurantInfo } from "@/lib/restaurant.functions";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Flamio — Kishoreganj Sadar" },
      {
        name: "description",
        content:
          "Flamio location, opening hours, and contact information in Kishoreganj Sadar.",
      },
      { property: "og:title", content: "Contact Flamio — Kishoreganj Sadar" },
      {
        property: "og:description",
        content: "Flamio location, opening hours, and contact information.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const getInfo = useServerFn(getPublicRestaurantInfo);
  const infoQuery = useQuery({
    queryKey: ["public-restaurant-info"],
    queryFn: () => getInfo(),
    staleTime: 60_000,
  });
  const info = infoQuery.data ?? null;

  const name = info?.name ?? restaurant.name;
  const tagline = info?.tagline ?? restaurant.tagline;
  const facebookPageName = info?.facebookPageName?.trim() || "Facebook";
  const facebookUrl = info?.facebookUrl ?? restaurant.facebookUrl;
  const googleMapsUrl = info?.googleMapsUrl ?? restaurant.googleMapsUrl;
  const addressLine = info?.addressLine ?? restaurant.addressLine;
  const city = info?.city ?? restaurant.city;
  const country = info?.country ?? restaurant.country;
  const hoursText =
    info?.opensAt && info?.closesAt ? `Open • ${info.opensAt} – ${info.closesAt}` : null;

  const addressText = [
    addressLine,
    city && country ? `${city}, ${country}` : city || country,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col px-4 py-6 pb-28 text-foreground sm:px-6 sm:py-8">
      <div className="flex flex-col items-center gap-1 py-4">
        <div className="flex items-center gap-2 font-display text-4xl font-bold tracking-tight text-primary">
          <Flame aria-hidden="true" className="size-8 fill-current" />
          <span>{name}</span>
        </div>
        {tagline ? (
          <p className="text-sm font-medium text-muted-foreground">{tagline}</p>
        ) : null}
      </div>

      <div className="my-2 border-t border-border/40" />

      <div className="flex flex-col">
        <ContactRow
          icon={<MapPin aria-hidden="true" className="size-5 shrink-0 text-primary" />}
          title="Location"
          subtitle={addressText || "—"}
          href={googleMapsUrl ?? undefined}
        />

        <ContactRow
          icon={<Clock3 aria-hidden="true" className="size-5 shrink-0 text-primary" />}
          title="Opening Hours"
          subtitle={hoursText ?? "—"}
        />

        {facebookUrl ? (
          <ContactRow
            icon={<Facebook aria-hidden="true" className="size-5 shrink-0 text-[#1877F2]" />}
            title={facebookPageName}
            subtitle=""
            href={facebookUrl}
            external
          />
        ) : null}
      </div>
    </div>
  );
}

function ContactRow({
  icon,
  title,
  subtitle,
  href,
  external,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href?: string | undefined;
  external?: boolean;
}) {
  const content = (
    <div className="flex items-center gap-3 py-4">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {subtitle ? (
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </div>
  );

  const classes = "group flex cursor-pointer border-b border-border/40 transition-smooth hover:bg-muted/30";

  if (href) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        aria-label={`Open ${title}${external ? " in a new tab" : ""}`}
        className={classes}
      >
        {content}
      </a>
    );
  }

  return <div className={classes}>{content}</div>;
}
