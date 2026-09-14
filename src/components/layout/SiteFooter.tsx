import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, ShieldCheck } from "lucide-react";

import { restaurant } from "@/data/restaurant";
import { useAuth } from "@/hooks/use-auth";
import { getOwnerAccess } from "@/lib/owner.functions";

export function SiteFooter() {
  const { isAuthenticated } = useAuth();
  const fetchAccess = useServerFn(getOwnerAccess);
  const access = useQuery({
    queryKey: ["owner-access"],
    queryFn: () => fetchAccess(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
  const showOwnerLink = Boolean(access.data?.isOwner || access.data?.canClaim);

  return (
    <footer className="mt-20 border-t border-border/60 bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-ember text-lg font-black text-primary-foreground">
              F
            </span>
            <span className="font-display text-xl font-extrabold">{restaurant.name}</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {restaurant.tagline}
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Visit us
          </h2>
          <p className="mt-4 flex items-start gap-2 text-sm text-foreground">
            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              {restaurant.addressLine}
              <br />
              {restaurant.city}, {restaurant.country}
            </span>
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Phone: {restaurant.phone ?? "Not added yet"}
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Explore
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link to="/menu" className="text-muted-foreground transition-smooth hover:text-foreground">
                Full menu
              </Link>
            </li>
            <li>
              <Link to="/cart" className="text-muted-foreground transition-smooth hover:text-foreground">
                Your cart
              </Link>
            </li>
            <li>
              <Link
                to="/contact"
                className="text-muted-foreground transition-smooth hover:text-foreground"
              >
                Contact & location
              </Link>
            </li>
            {showOwnerLink ? (
            <li>
              <Link
                to="/owner"
                className="inline-flex items-center gap-1.5 text-muted-foreground/70 transition-smooth hover:text-foreground"
              >
                <ShieldCheck aria-hidden="true" className="size-3.5" />
                Owner Dashboard
              </Link>
            </li>
            ) : null}
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {restaurant.name}. All rights reserved.
      </div>
    </footer>
  );
}
