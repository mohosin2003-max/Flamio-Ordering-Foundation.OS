/**
 * Owner → Customers → one customer → Communication.
 *
 * Read-only view built on top of the existing notification, push and inbox
 * data. Nothing here sends a message and no provider is contacted.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Check, MessageCircle, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { crmGetCommunication } from "@/lib/crm-communication.functions";
import type { ChannelState } from "@/lib/crm-communication.functions";

function StateBadge({ state }: { state: ChannelState }) {
  if (state === "available") {
    return (
      <Badge>
        <Check className="mr-1 h-3 w-3" /> Available
      </Badge>
    );
  }
  if (state === "unavailable") {
    return (
      <Badge variant="secondary">
        <X className="mr-1 h-3 w-3" /> Unavailable
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <Ban className="mr-1 h-3 w-3" /> Not configured
    </Badge>
  );
}

export function CustomerCommunication({ phoneKey }: { phoneKey: string }) {
  const fetchCommunication = useServerFn(crmGetCommunication);
  const view = useQuery({
    queryKey: ["crm-communication", phoneKey],
    queryFn: () => fetchCommunication({ data: { phone: phoneKey } }),
    retry: false,
  });

  if (view.isLoading) return <Skeleton className="h-64 w-full" />;
  if (view.error || !view.data) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Communication details aren&apos;t available for this customer.
        </CardContent>
      </Card>
    );
  }

  const data = view.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-base font-bold">Communication</h3>
        <Badge variant={data.accountLinked ? "default" : "secondary"}>
          {data.accountLinked ? "Account" : "Guest"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Phone on file: {data.hasPhone ? "yes" : "no"} · Email on file:{" "}
          {data.hasEmail ? "yes" : "no"}
        </span>
      </div>

      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Channels
          </p>
          {data.channels.map((channel) => (
            <div
              key={channel.channel}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{channel.label}</p>
                <p className="text-xs text-muted-foreground">{channel.detail}</p>
              </div>
              <StateBadge state={channel.state} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What this customer may receive
          </p>
          {data.preferences.map((preference) => (
            <div
              key={preference.category}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{preference.label}</p>
                <p className="text-xs text-muted-foreground">{preference.detail}</p>
              </div>
              <Badge variant={preference.enabled ? "default" : "secondary"}>
                {preference.enabled ? "On" : "Off"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Message this customer
          </p>
          {data.accountLinked ? (
            <>
              <p className="text-sm text-muted-foreground">
                Replies go through the existing customer inbox. SMS, WhatsApp and email are not
                connected, so they can&apos;t be used.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link to="/owner/inbox">
                  <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                  {data.conversationId ? "Open in inbox" : "Go to inbox"}
                </Link>
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This is a guest customer. There is no in-app inbox and no SMS, WhatsApp or email
              provider is connected, so Flamio cannot deliver a message to them yet. Their phone
              number is on file for a manual call.
            </p>
          )}
        </CardContent>
      </Card>

      {data.canSeeHistory ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Communication history
            </p>
            {data.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing has been sent yet.</p>
            ) : (
              data.history.map((item) => (
                <div
                  key={item.id}
                  className="border-b border-border/60 py-2 text-sm last:border-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{item.title}</span>
                    <Badge variant="outline">{item.category}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {item.createdAt.slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                  {item.preview ? (
                    <p className="text-xs text-muted-foreground">{item.preview}</p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
