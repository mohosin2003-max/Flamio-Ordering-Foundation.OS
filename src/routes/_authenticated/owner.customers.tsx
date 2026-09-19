import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatBDT } from "@/lib/format";
import {
  ownerListNotifiableCustomers,
  ownerSendCustomerNotification,
} from "@/lib/push.functions";
import { ownerListCustomers, ownerSendPromotion } from "@/lib/reports.functions";

/**
 * Owner → Customers. Reads the EXISTING CRM server function (built from order
 * history) and sends promotions through the existing notifications table.
 */
export const Route = createFileRoute("/_authenticated/owner/customers")({
  component: OwnerCustomers,
});

type Segment = "all" | "new" | "returning" | "frequent" | "inactive";

function OwnerCustomers() {
  const listCustomers = useServerFn(ownerListCustomers);
  const sendPromotion = useServerFn(ownerSendPromotion);
  const listAccounts = useServerFn(ownerListNotifiableCustomers);
  const sendCustomerNotification = useServerFn(ownerSendCustomerNotification);

  const [segment, setSegment] = useState<Segment>("all");
  const [promo, setPromo] = useState({ title: "", body: "" });
  const [sending, setSending] = useState(false);
  const [personal, setPersonal] = useState({ userId: "", title: "", body: "" });
  const [sendingPersonal, setSendingPersonal] = useState(false);

  const customers = useQuery({
    queryKey: ["owner-customers"],
    queryFn: () => listCustomers(),
  });

  const accounts = useQuery({
    queryKey: ["owner-customer-accounts"],
    queryFn: () => listAccounts(),
    retry: false,
  });

  const sendPersonal = async () => {
    setSendingPersonal(true);
    try {
      const result = await sendCustomerNotification({
        data: {
          userId: personal.userId,
          title: personal.title.trim(),
          body: personal.body.trim(),
        },
      });
      toast.success(
        result.pushed > 0
          ? "Sent to their phone."
          : "Saved in their notifications — no phone registered yet.",
      );
      setPersonal({ userId: "", title: "", body: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send this message");
    } finally {
      setSendingPersonal(false);
    }
  };


  if (customers.isLoading) return <Skeleton className="h-96 w-full" />;

  if (customers.error) {
    return (
      <EmptyState
        title="Couldn't load customers"
        description="Something went wrong loading your customers."
        action={<Button onClick={() => void customers.refetch()}>Try again</Button>}
      />
    );
  }

  const rows = customers.data ?? [];
  const visible = segment === "all" ? rows : rows.filter((c) => c.segment === segment);

  const send = async () => {
    setSending(true);
    try {
      const result = await sendPromotion({
        data: { title: promo.title.trim(), body: promo.body.trim(), segment },
      });
      toast.success(
        result.sent === 0
          ? "No customers with an account matched this group."
          : `Sent to ${result.sent} customer${result.sent === 1 ? "" : "s"}`,
      );
      setPromo({ title: "", body: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send this promotion");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Customers" value={String(rows.length)} />
        <Stat
          label="Repeat customers"
          value={String(rows.filter((c) => c.orderCount > 1).length)}
        />
        <Stat
          label="Total spend"
          value={formatBDT(rows.reduce((sum, c) => sum + c.totalSpent, 0))}
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="font-display text-base font-bold">Send a promotion</h2>
          <div className="space-y-1.5">
            <Label>Customer group</Label>
            <Select value={segment} onValueChange={(value) => setSegment(value as Segment)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                <SelectItem value="new">New (1 order)</SelectItem>
                <SelectItem value="returning">Returning (2-4 orders)</SelectItem>
                <SelectItem value="frequent">Frequent (5+ orders)</SelectItem>
                <SelectItem value="inactive">Inactive (60+ days)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cr-title">Title</Label>
            <Input
              id="cr-title"
              value={promo.title}
              onChange={(e) => setPromo({ ...promo, title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cr-body">Message</Label>
            <Textarea
              id="cr-body"
              rows={3}
              value={promo.body}
              onChange={(e) => setPromo({ ...promo, body: e.target.value })}
            />
          </div>
          <Button
            disabled={sending || promo.title.trim().length < 3 || promo.body.trim().length < 3}
            onClick={() => void send()}
          >
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Send promotion
          </Button>
          <p className="text-xs text-muted-foreground">
            Promotions appear in the notification bell of customers who have an account.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="font-display text-base font-bold">Message one customer</h2>
          <p className="text-xs text-muted-foreground">
            A personal notification, separate from order updates and promotions. It reaches the
            customer&apos;s phone when they have turned phone notifications on.
          </p>
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <Select
              value={personal.userId}
              onValueChange={(value) => setPersonal({ ...personal, userId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a customer" />
              </SelectTrigger>
              <SelectContent>
                {(accounts.data ?? []).map((c) => (
                  <SelectItem key={c.userId} value={c.userId}>
                    {c.name}
                    {c.hasDevice ? " · phone ready" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pn-title">Title</Label>
            <Input
              id="pn-title"
              value={personal.title}
              onChange={(e) => setPersonal({ ...personal, title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pn-body">Message</Label>
            <Textarea
              id="pn-body"
              rows={3}
              value={personal.body}
              onChange={(e) => setPersonal({ ...personal, body: e.target.value })}
            />
          </div>
          <Button
            disabled={
              sendingPersonal ||
              !personal.userId ||
              personal.title.trim().length < 3 ||
              personal.body.trim().length < 3
            }
            onClick={() => void sendPersonal()}
          >
            {sendingPersonal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Send to this customer
          </Button>
        </CardContent>
      </Card>



      <div className="space-y-3">
        <h2 className="font-display text-base font-bold">
          Customers {segment === "all" ? "" : `· ${segment}`}
        </h2>
        {visible.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Customers appear here once orders are placed."
          />
        ) : (
          visible.map((c) => (
            <Card key={c.key}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold">
                    {c.name}
                    <Badge variant="secondary">{c.segment}</Badge>
                  </div>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {c.phoneMasked} · {c.orderCount} order{c.orderCount === 1 ? "" : "s"} · last{" "}
                    {c.lastOrderAt.slice(0, 10)}
                  </p>
                </div>
                <span className="font-semibold">{formatBDT(c.totalSpent)}</span>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 font-display text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
