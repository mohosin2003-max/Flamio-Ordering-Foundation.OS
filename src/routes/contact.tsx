import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, ExternalLink, Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";

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

  const phone = info?.phone ?? restaurant.phone;
  const email = info?.email ?? restaurant.email;
  const facebookUrl = info?.facebookUrl ?? restaurant.facebookUrl;
  const instagramUrl = info?.instagramUrl ?? restaurant.instagramUrl;
  const googleMapsUrl = info?.googleMapsUrl ?? restaurant.googleMapsUrl;
  const addressLine = info?.addressLine ?? restaurant.addressLine;
  const city = info?.city ?? restaurant.city;
  const country = info?.country ?? restaurant.country;
  const hoursText = info?.opensAt && info?.closesAt ? `${info.opensAt} – ${info.closesAt}` : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 pb-28 sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl font-black sm:text-4xl">Contact</h1>
      <div className="mt-6 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <section className="flex gap-4 p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <MapPin aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold">Location</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {addressLine}<br />{city}, {country}
            </p>
            {googleMapsUrl ? (
              <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                Open map <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            ) : null}
          </div>
        </section>

        <section className="flex gap-4 p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Clock3 aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold">Opening hours</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hoursText ? `Every day · ${hoursText}` : "Opening hours not added yet"}
            </p>
            {info && !info.isOpen ? <p className="mt-1 text-sm font-medium text-primary">Currently not taking orders</p> : null}
          </div>
        </section>

        <section className="flex gap-4 p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Phone aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold">Call &amp; contact</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {phone ? <a href={`tel:${phone}`} className="font-semibold text-primary hover:underline">{phone}</a> : <span className="text-muted-foreground">Phone not added yet</span>}
              {email ? <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><Mail aria-hidden="true" className="size-4" />{email}</a> : null}
              {facebookUrl ? <a href={facebookUrl} target="_blank" rel="noreferrer" aria-label="Flamio on Facebook" className="text-muted-foreground hover:text-primary"><Facebook aria-hidden="true" className="size-4" /></a> : null}
              {instagramUrl ? <a href={instagramUrl} target="_blank" rel="noreferrer" aria-label="Flamio on Instagram" className="text-muted-foreground hover:text-primary"><Instagram aria-hidden="true" className="size-4" /></a> : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
