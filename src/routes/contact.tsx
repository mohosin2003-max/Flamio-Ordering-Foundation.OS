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

  const facebookUrl = info?.facebookUrl ?? restaurant.facebookUrl;
  const googleMapsUrl = info?.googleMapsUrl ?? restaurant.googleMapsUrl;
  const addressLine = info?.addressLine ?? restaurant.addressLine;
  const city = info?.city ?? restaurant.city;
  const country = info?.country ?? restaurant.country;
  const hoursText = info?.opensAt && info?.closesAt ? `${info.opensAt} – ${info.closesAt}` : null;

  const hasAddress = Boolean(addressLine || city || country);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col gap-4 px-4 py-10 pb-28 text-left sm:px-6 sm:py-14">
      <h1 className="text-center font-display text-4xl font-black sm:text-5xl">
        {restaurant.name}
      </h1>

      {hasAddress ? (
        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-card">
          <div className="flex items-center gap-2">
            <MapPin aria-hidden="true" className="size-5 text-primary" />
            <h2 className="text-base font-semibold">Location</h2>
          </div>
          <address className="mt-3 text-sm not-italic leading-relaxed text-muted-foreground">
            {addressLine ? <>{addressLine}<br /></> : null}
            {city || country ? <>{city}{city && country ? ", " : ""}{country}</> : null}
          </address>
          {googleMapsUrl ? (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              Open map <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-card">
        <div className="flex items-center gap-2">
          <Clock3 aria-hidden="true" className="size-5 text-primary" />
          <h2 className="text-base font-semibold">Opening Hours</h2>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {hoursText ? `Every day · ${hoursText}` : "Opening hours not added yet"}
        </p>
      </section>

      {facebookUrl ? (
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-card">
          <a
            href={facebookUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Visit Flamio on Facebook"
            className="flex items-center gap-3 text-foreground transition-smooth hover:text-primary"
          >
            <Facebook aria-hidden="true" className="size-6 text-primary" />
            <span className="text-sm font-semibold">Flamio on Facebook</span>
            <ExternalLink aria-hidden="true" className="ml-auto size-4 text-muted-foreground" />
          </a>
        </section>
      ) : null}
    </div>
  );
}
