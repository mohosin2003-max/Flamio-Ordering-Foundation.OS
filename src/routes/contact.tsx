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

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 pb-28 sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl font-black sm:text-4xl">Contact</h1>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-card">
          <MapPin aria-hidden="true" className="size-5 text-primary" />
          <h2 className="mt-3 text-base font-semibold">Location</h2>
          {(addressLine || city || country) ? (
            <address className="mt-2 text-sm not-italic leading-relaxed text-muted-foreground">
              {addressLine ? <>{addressLine}<br /></> : null}
              {city || country ? <>{city}{city && country ? ", " : ""}{country}</> : null}
            </address>
          ) : null}
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

        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-card">
          <Clock3 aria-hidden="true" className="size-5 text-primary" />
          <h2 className="mt-3 text-base font-semibold">Opening hours</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {hoursText ? `Every day · ${hoursText}` : "Opening hours not added yet"}
          </p>
        </section>

        {facebookUrl ? (
          <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-card">
            <Facebook aria-hidden="true" className="size-5 text-primary" />
            <h2 className="mt-3 text-base font-semibold">Facebook</h2>
            <a
              href={facebookUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Visit Flamio on Facebook"
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              Visit our page <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          </section>
        ) : null}
      </div>
    </div>
  );
}
