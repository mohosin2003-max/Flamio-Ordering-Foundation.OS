import { Clock, Facebook, Instagram, MapPin, Phone } from "lucide-react";

import type { Restaurant } from "@/types/menu";

function PendingValue({ children }: { children: string }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function LocationSection({ restaurant }: { restaurant: Restaurant }) {
  const hoursConfigured = restaurant.openingHours.some((h) => h.opensAt && h.closesAt);

  return (
    <section
      aria-labelledby="location-heading"
      className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6"
    >
      <h2 id="location-heading" className="font-display text-3xl font-extrabold sm:text-4xl">
        Find <span className="text-gradient-ember">Flamio</span>
      </h2>
      <p className="mt-3 max-w-xl text-muted-foreground">{restaurant.about}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-card">
          <MapPin aria-hidden="true" className="size-5 text-primary" />
          <h3 className="mt-3 text-base font-semibold">Location</h3>
          <address className="mt-2 text-sm not-italic leading-relaxed text-muted-foreground">
            {restaurant.addressLine}
            <br />
            {restaurant.city}, {restaurant.country}
          </address>
          <p className="mt-3 text-sm">
            Map link: {restaurant.googleMapsUrl ? (
              <a
                href={restaurant.googleMapsUrl}
                className="text-primary underline-offset-4 hover:underline"
              >
                Open in Google Maps
              </a>
            ) : (
              <PendingValue>Not added yet</PendingValue>
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-card">
          <Clock aria-hidden="true" className="size-5 text-primary" />
          <h3 className="mt-3 text-base font-semibold">Opening hours</h3>
          {hoursConfigured ? (
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {restaurant.openingHours.map((h) => (
                <li key={h.day} className="flex justify-between gap-4">
                  <span>{h.day}</span>
                  <span>
                    {h.opensAt && h.closesAt ? `${h.opensAt} – ${h.closesAt}` : "Closed"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Opening hours will be published soon.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-card">
          <Phone aria-hidden="true" className="size-5 text-primary" />
          <h3 className="mt-3 text-base font-semibold">Contact</h3>
          <ul className="mt-2 space-y-2 text-sm">
            <li>
              Phone:{" "}
              {restaurant.phone ? (
                <a href={`tel:${restaurant.phone}`} className="text-primary hover:underline">
                  {restaurant.phone}
                </a>
              ) : (
                <PendingValue>Not added yet</PendingValue>
              )}
            </li>
            <li className="flex items-center gap-2">
              <Facebook aria-hidden="true" className="size-4 text-muted-foreground" />
              {restaurant.facebookUrl ? (
                <a href={restaurant.facebookUrl} className="text-primary hover:underline">
                  Facebook
                </a>
              ) : (
                <PendingValue>Facebook not added yet</PendingValue>
              )}
            </li>
            <li className="flex items-center gap-2">
              <Instagram aria-hidden="true" className="size-4 text-muted-foreground" />
              {restaurant.instagramUrl ? (
                <a href={restaurant.instagramUrl} className="text-primary hover:underline">
                  Instagram
                </a>
              ) : (
                <PendingValue>Instagram not added yet</PendingValue>
              )}
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
