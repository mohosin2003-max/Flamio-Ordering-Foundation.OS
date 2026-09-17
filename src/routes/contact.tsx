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

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col gap-3 px-4 py-8 pb-28 text-left sm:px-6 sm:py-10">
      <h1 className="mb-2 text-center font-display text-3xl font-black sm:text-4xl">
        {name}
      </h1>

      {hasAddress ? (
        <section className="border-b border-border/70 py-4">
          <div className="flex gap-3">
            <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <h2 className="font-semibold">Location</h2>
              <address className="mt-1 text-sm not-italic leading-relaxed text-muted-foreground">
                {addressLine ? <>{addressLine}<br /></> : null}
                {city || country ? <>{city}{city && country ? ", " : ""}{country}</> : null}
              </address>
              {googleMapsUrl ? (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  Open map <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="border-b border-border/70 py-4">
        <div className="flex gap-3">
          <Clock3 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-semibold">Opening Hours</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hoursText ?? "Not added yet"}
            </p>
          </div>
        </div>
      </section>

      {facebookUrl ? (
        <a
          href={facebookUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${facebookPageName} on Facebook`}
          className="flex items-center gap-3 py-3 text-sm font-semibold text-foreground transition-smooth hover:text-primary"
        >
          <Facebook aria-hidden="true" className="size-5 shrink-0 text-primary" />
          <span>{facebookPageName}</span>
          <ExternalLink aria-hidden="true" className="ml-auto size-3.5 text-muted-foreground" />
        </a>
      ) : null}
    </div>
  );
}
