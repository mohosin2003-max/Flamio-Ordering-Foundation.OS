import { ChevronRight, Clock, Facebook, Instagram, MapPin, Phone } from "lucide-react";

import { ContactRow } from "@/routes/contact";

import type { Restaurant } from "@/types/menu";

function PendingValue({ children }: { children: string }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function InfoRow({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="group flex w-full min-w-0 border-b border-border/40 transition-smooth hover:bg-muted/30">
      <div className="flex w-full min-w-0 items-start gap-3 py-4">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {children}
        </div>
        <ChevronRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      </div>
    </div>
  );
}

export function LocationSection({ restaurant }: { restaurant: Restaurant }) {
  const hoursConfigured = restaurant.openingHours.some((h) => h.opensAt && h.closesAt);

  const addressText = [
    restaurant.addressLine,
    restaurant.city && restaurant.country ? `${restaurant.city}, ${restaurant.country}` : restaurant.city || restaurant.country,
  ]
    .filter(Boolean)
    .join(" · ");

  return (

    <section
      aria-labelledby="location-heading"
      className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6"
    >
      <h2 id="location-heading" className="font-display text-3xl font-extrabold sm:text-4xl">
        Find <span className="text-gradient-ember">Flamio</span>
      </h2>
      <p className="mt-3 max-w-xl text-muted-foreground">{restaurant.about}</p>

      <div className="mt-8 flex flex-col">
        <ContactRow
          icon={<MapPin aria-hidden="true" className="size-5 shrink-0 text-primary" />}
          title="Location"
          subtitle={addressText || "—"}
          href={restaurant.googleMapsUrl ?? undefined}
        />

        <InfoRow
          icon={<Clock aria-hidden="true" className="size-5 shrink-0 text-primary" />}
          title="Opening Hours"
        >
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
        </InfoRow>

        <InfoRow
          icon={<Phone aria-hidden="true" className="size-5 shrink-0 text-primary" />}
          title="Contact"
        >
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
        </InfoRow>
      </div>
    </section>
  );
}
