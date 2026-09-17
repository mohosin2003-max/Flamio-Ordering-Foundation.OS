import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PaymentProvidersSection } from "@/components/owner/payment-providers";
import { ownerGetSettings, ownerUpdateSettings } from "@/lib/owner.functions";
import type { RestaurantSettings } from "@/lib/owner.functions";

export const Route = createFileRoute("/_authenticated/owner/settings")({
  component: OwnerSettings,
});

function OwnerSettings() {
  const getSettings = useServerFn(ownerGetSettings);
  const updateSettings = useServerFn(ownerUpdateSettings);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RestaurantSettings | null>(null);
  const [saving, setSaving] = useState(false);

  const settings = useQuery({
    queryKey: ["owner-settings"],
    queryFn: () => getSettings(),
  });

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  if (settings.isLoading) return <Skeleton className="h-80 w-full" />;

  if (settings.error) {
    return (
      <EmptyState
        title="Couldn't load settings"
        description="Please try again."
        action={<Button onClick={() => void settings.refetch()}>Retry</Button>}
      />
    );
  }

  if (!form) {
    return <EmptyState title="No restaurant profile" description="Settings aren't set up yet." />;
  }

  const set = <K extends keyof RestaurantSettings>(key: K, value: RestaurantSettings[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="font-medium">Accepting orders</p>
              <p className="text-sm text-muted-foreground">Turn off to pause new orders.</p>
            </div>
            <Switch checked={form.isOpen} onCheckedChange={(v) => set("isOpen", v)} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="pr-3">
              <p className="font-medium">Advanced inventory mode</p>
              <p className="text-sm text-muted-foreground">
                On: orders automatically use up recipe ingredients. Off (simple): purchases and
                expense reports only — new orders don&apos;t change stock.
              </p>
            </div>
            <Switch
              checked={form.inventoryMode === "advanced"}
              onCheckedChange={(v) => set("inventoryMode", v ? "advanced" : "simple")}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="pr-3">
                <p className="font-medium">Recommended for You</p>
                <p className="text-sm text-muted-foreground">
                  Shows customers items to order again plus new picks on the home page. Featured
                  items are chosen in the Menu screen.
                </p>
              </div>
              <Switch
                checked={form.recommendationsEnabled}
                onCheckedChange={(v) => set("recommendationsEnabled", v)}
              />
            </div>
            {form.recommendationsEnabled && (
              <Field label="How many items to show (1–12)">
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={form.recommendationsCount}
                  onChange={(e) =>
                    set(
                      "recommendationsCount",
                      Math.min(Math.max(Number(e.target.value) || 1, 1), 12),
                    )
                  }
                />
              </Field>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="pr-3">
                <p className="font-medium">Customer reviews</p>
                <p className="text-sm text-muted-foreground">
                  Lets customers rate a completed order. Approved reviews show on the food page.
                </p>
              </div>
              <Switch
                checked={form.reviewsEnabled}
                onCheckedChange={(v) => set("reviewsEnabled", v)}
              />
            </div>
            {form.reviewsEnabled && (
              <div className="flex items-center justify-between">
                <div className="pr-3">
                  <p className="font-medium">Allow review photos</p>
                  <p className="text-sm text-muted-foreground">
                    Customers may add one food photo with their review.
                  </p>
                </div>
                <Switch
                  checked={form.reviewPhotosEnabled}
                  onCheckedChange={(v) => set("reviewPhotosEnabled", v)}
                />
              </div>
            )}
          </div>

          <Field label="Restaurant name">

            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Tagline">
            <Textarea
              value={form.tagline ?? ""}
              onChange={(e) => set("tagline", e.target.value || null)}
              rows={2}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone">
              <Input
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value || null)}
              />
            </Field>
            <Field label="Email">
              <Input
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value || null)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Opening time">
              <Input
                placeholder="e.g. 10:00 AM"
                value={form.opensAt ?? ""}
                onChange={(e) => set("opensAt", e.target.value || null)}
              />
            </Field>
            <Field label="Closing time">
              <Input
                placeholder="e.g. 11:00 PM"
                value={form.closesAt ?? ""}
                onChange={(e) => set("closesAt", e.target.value || null)}
              />
            </Field>
          </div>
          <Field label="Address">
            <Input
              value={form.addressLine ?? ""}
              onChange={(e) => set("addressLine", e.target.value || null)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City">
              <Input
                value={form.city ?? ""}
                onChange={(e) => set("city", e.target.value || null)}
              />
            </Field>
            <Field label="Country">
              <Input
                value={form.country ?? ""}
                onChange={(e) => set("country", e.target.value || null)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Facebook Page Name">
              <Input
                placeholder="Flamio"
                value={form.facebookPageName ?? ""}
                onChange={(e) => set("facebookPageName", e.target.value || null)}
              />
            </Field>
            <Field label="Facebook Page URL">
              <Input
                type="url"
                placeholder="https://facebook.com/…"
                value={form.facebookUrl ?? ""}
                onChange={(e) => set("facebookUrl", e.target.value || null)}
              />
            </Field>
          </div>
          <Field label="Instagram profile URL">
            <Input
              placeholder="https://instagram.com/…"
              value={form.instagramUrl ?? ""}
              onChange={(e) => set("instagramUrl", e.target.value || null)}
            />
          </Field>
          <Field label="Google Maps URL">
            <Input
              placeholder="https://maps.google.com/…"
              value={form.googleMapsUrl ?? ""}
              onChange={(e) => set("googleMapsUrl", e.target.value || null)}
            />
          </Field>

          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await updateSettings({ data: form });
                await queryClient.invalidateQueries({ queryKey: ["owner-settings"] });
                toast.success("Settings saved");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Couldn't save settings");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        </CardContent>
      </Card>

      <PaymentProvidersSection />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
