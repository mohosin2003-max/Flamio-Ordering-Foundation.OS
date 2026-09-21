import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronRight,
  Facebook,
  Flame,
  Instagram,
  MessageCircle,
  MessagesSquare,
  Phone,
  UserRound,
} from "lucide-react";

import { restaurant } from "@/data/restaurant";
import { getPublicRestaurantInfo } from "@/lib/restaurant.functions";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Flamio — Kishoreganj Sadar" },
      {
        name: "description",
        content: "Call, message, or connect with Flamio in Kishoreganj Sadar.",
      },
      { property: "og:title", content: "Contact Flamio — Kishoreganj Sadar" },
      {
        property: "og:description",
        content: "Call, message, or connect with Flamio.",
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
  const instagramUrl = info?.instagramUrl ?? restaurant.instagramUrl;
  const phoneDigits = info?.phone?.replace(/\D/g, "") ?? "";
  const ownerPhoneDigits = info?.ownerPhone?.replace(/\D/g, "") ?? "";
  const whatsappDigits = info?.whatsappNumber?.replace(/\D/g, "") ?? "";

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
        {info?.contactCallRestaurantEnabled && info.phone ? <ContactRow icon={<Phone aria-hidden="true" className="size-5 text-primary" />} title="Call Restaurant" subtitle={info.phone} href={`tel:${info.phone}`} /> : null}
        {info?.contactWhatsappEnabled && whatsappDigits ? <ContactRow icon={<MessageCircle aria-hidden="true" className="size-5 text-primary" />} title="WhatsApp" subtitle={info.whatsappNumber ?? "WhatsApp"} href={`https://wa.me/${whatsappDigits}`} external /> : null}
        {info?.contactCallRestaurantEnabled && phoneDigits ? <ContactRow icon={<MessageCircle aria-hidden="true" className="size-5 text-primary" />} title="Restaurant WhatsApp" subtitle={info.phone ?? "WhatsApp"} href={`https://wa.me/${phoneDigits}`} external /> : null}
        {info?.contactCallOwnerEnabled && info.ownerPhone ? <ContactRow icon={<UserRound aria-hidden="true" className="size-5 text-primary" />} title="Call Owner" subtitle={info.ownerPhone} href={`tel:${info.ownerPhone}`} /> : null}
        {info?.contactCallOwnerEnabled && ownerPhoneDigits ? <ContactRow icon={<MessageCircle aria-hidden="true" className="size-5 text-primary" />} title="Owner WhatsApp" subtitle={info.ownerPhone ?? "WhatsApp"} href={`https://wa.me/${ownerPhoneDigits}`} external /> : null}
        {info?.contactInboxEnabled ? <ContactRow icon={<MessagesSquare aria-hidden="true" className="size-5 text-primary" />} title="Customer Message / Inbox" subtitle="Message the Flamio team" to="/account/inbox" /> : null}
        {info?.contactFacebookEnabled ? (
          <ContactRow
            icon={<Facebook aria-hidden="true" className="size-5 shrink-0 text-primary" />}
            title="Facebook Page"
            subtitle={facebookUrl ? facebookPageName : "Not configured yet"}
            href={facebookUrl ?? undefined}
            external
          />
        ) : null}
        {instagramUrl ? <ContactRow icon={<Instagram aria-hidden="true" className="size-5 text-primary" />} title="Instagram" subtitle="Flamio on Instagram" href={instagramUrl} external /> : null}
        {info?.contactMessengerEnabled ? <ContactRow icon={<MessageCircle aria-hidden="true" className="size-5 text-primary" />} title="Message on Facebook / Messenger" subtitle={info.messengerUrl ? facebookPageName : "Not configured yet"} href={info.messengerUrl ?? undefined} external /> : null}
      </div>
    </div>
  );
}

export function ContactRow({
  icon,
  title,
  subtitle,
  href,
  external,
  to,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href?: string | undefined;
  external?: boolean;
  to?: "/account/inbox" | "/contact";
}) {
  const content = (
    <div className="flex w-full min-w-0 items-center gap-3 py-4">
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

  const classes = "group flex w-full min-w-0 cursor-pointer border-b border-border/40 transition-smooth hover:bg-muted/30";

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

  if (to) return <Link to={to} className={classes}>{content}</Link>;

  return <div className={classes}>{content}</div>;
}
