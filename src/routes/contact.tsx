import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, ExternalLink, Facebook, MapPin } from "lucide-react";

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
  const facebookPageName = info?.facebookPageName?.trim() || "Facebook";
  const facebookUrl = info?.facebookUrl ?? restaurant.facebookUrl;
  const googleMapsUrl = info?.googleMapsUrl ?? restaurant.googleMapsUrl;
  const addressLine = info?.addressLine ?? restaurant.addressLine;
  const city = info?.city ?? restaurant.city;
  const country = info?.country ?? restaurant.country;
  const hoursText = info?.opensAt && info?.closesAt ? `${info.opensAt} – ${info.closesAt}` : null;

  const hasAddress = Boolean(addressLine || city || country);
  const addressText = [addressLine, city && country ? `${city}, ${country}` : city || country]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col gap-4 px-4 py-6 pb-28 text-foreground sm:px-6 sm:py-8">
      <h1 className="mb-1 text-center font-display text-2xl font-bold tracking-tight">
        {name}
      </h1>

      {hasAddress ? (
        <div className="flex items-start gap-3">
          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 text-sm">
            <p className="text-muted-foreground">{addressText}</p>
            {googleMapsUrl ? (
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Open map <ExternalLink aria-hidden="true" className="size-3" />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="min-w-0 text-sm text-muted-foreground">
          {hoursText ?? "—"}
        </p>
      </div>

      {facebookUrl ? (
        <a
          href={facebookUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${facebookPageName} on Facebook`}
          className="flex items-center gap-3 py-1 text-sm font-medium text-foreground transition-smooth hover:text-primary"
        >
          <Facebook aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <span>{facebookPageName}</span>
        </a>
      ) : null}
    </div>
  );
}
