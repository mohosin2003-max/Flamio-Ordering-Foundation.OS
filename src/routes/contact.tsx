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
  const primaryWhatsappDigits = whatsappDigits || phoneDigits;
  const primaryWhatsappLabel = info?.whatsappNumber || info?.phone || "WhatsApp";
  const callRestaurantEnabled = info ? info.contactCallRestaurantEnabled : Boolean(restaurant.phone);
  const whatsappEnabled = info ? info.contactWhatsappEnabled : false;
  const callOwnerEnabled = info?.contactCallOwnerEnabled === true;

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
        {callRestaurantEnabled ? <ContactRow icon={<Phone aria-hidden="true" className="size-5 text-primary" />} title="Call Restaurant" subtitle={info?.phone ?? "Not configured yet"} href={info?.phone ? `tel:${info.phone}` : undefined} /> : null}
        {whatsappEnabled ? <ContactRow icon={<WhatsAppIcon className="size-5 text-primary" />} title="WhatsApp" subtitle={primaryWhatsappDigits ? primaryWhatsappLabel : "Not configured yet"} href={primaryWhatsappDigits ? `https://wa.me/${primaryWhatsappDigits}` : undefined} external /> : null}
        {callOwnerEnabled ? <ContactRow icon={<UserRound aria-hidden="true" className="size-5 text-primary" />} title="Call Owner" subtitle={info?.ownerPhone ?? "Not configured yet"} href={ownerPhoneDigits ? `tel:${info?.ownerPhone}` : undefined} /> : null}
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

  const hasAction = Boolean(href || to);
  const classes = `group flex w-full min-w-0 border-b border-border/40 transition-smooth ${hasAction ? "cursor-pointer hover:bg-muted/30" : "cursor-default"}`;

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

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12c0 2.2.7 4.2 1.9 5.8L2 22l4.2-1.9c1.5 1 3.3 1.5 5.1 1.5 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.7 0-3.3-.5-4.7-1.4l-.3-.2-2.5.8.8-2.5-.2-.3C3.9 14.8 3.5 13.4 3.5 12c0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5S16.7 20 12 20z" />
      <path d="M15.7 7.2c-.4-.1-.8-.2-1.2-.1-2.1.1-4 1.5-4.8 3.6-.4 1.1-.4 2.4.1 3.4.1.2 0 .4-.2.5l-.8.3c-.2.1-.3.3-.2.5.1.2.3.2.5.2l.8-.3c.4-.2.7-.6.6-1-.2-.7-.1-1.4.3-2 .5-1 1.6-1.6 2.7-1.4.2 0 .3-.2.3-.3 0-.2-.2-.4-.3-.4-.1 0-.2.1-.3.1z" />
    </svg>
  );
}
