import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  ownerDeletePromoBanner,
  ownerListPromoBanners,
  ownerSavePromoBanner,
} from "@/lib/banners.functions";
import { menuQueryOptions } from "@/lib/menu-repository";
import type { PromoBanner } from "@/types/menu";

export const Route = createFileRoute("/_authenticated/owner/banners")({
  head: () => ({
    meta: [
      { title: "Banner Management — Flamio" },
      { name: "description", content: "Manage Flamio promotional banners." },
      { property: "og:title", content: "Banner Management — Flamio" },
      { property: "og:description", content: "Manage Flamio promotional banners." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OwnerBanners,
});

type Destination = "none" | "menu" | "offers" | "category" | "product" | "custom";

type FormState = {
  id: string | null;
  desktopPath: string | null;
  mobilePath: string | null;
  desktopUrl: string | null;
  mobileUrl: string | null;
  destination: Destination;
  target: string;
  sortOrder: string;
  isActive: boolean;
};

const emptyForm = (): FormState => ({
  id: null,
  desktopPath: null,
  mobilePath: null,
  desktopUrl: null,
  mobileUrl: null,
  destination: "none",
  target: "",
  sortOrder: "0",
  isActive: true,
});

function parseDestination(href: string | null): Pick<FormState, "destination" | "target"> {
  if (!href) return { destination: "none", target: "" };
  if (href === "/menu") return { destination: "menu", target: "" };
  if (href === "/offers") return { destination: "offers", target: "" };
  if (href.startsWith("/menu?category=")) {
    return { destination: "category", target: decodeURIComponent(href.slice(15)) };
  }
  if (href.startsWith("/menu/") && !href.includes("?")) {
    return { destination: "product", target: decodeURIComponent(href.slice(6)) };
  }
  return { destination: "custom", target: href };
}

function toForm(banner: PromoBanner): FormState {
  return {
    id: banner.id,
    desktopPath: banner.desktopImagePath,
    mobilePath: banner.mobileImagePath,
    desktopUrl: banner.desktopImageUrl,
    mobileUrl: banner.mobileImageUrl,
    ...parseDestination(banner.ctaHref),
    sortOrder: String(banner.sortOrder),
    isActive: banner.isActive,
  };
}

function clickHref(form: FormState): string | null {
  if (form.destination === "menu") return "/menu";
  if (form.destination === "offers") return "/offers";
  if (form.destination === "category" && form.target) {
    return `/menu?category=${encodeURIComponent(form.target)}`;
  }
  if (form.destination === "product" && form.target) {
    return `/menu/${encodeURIComponent(form.target)}`;
  }
  if (form.destination === "custom" && form.target.trim()) return form.target.trim();
  return null;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function uploadBanner(file: File, kind: "desktop" | "mobile") {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Banner images must be 8 MB or smaller.");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${crypto.randomUUID()}/${kind}.${extension}`;
  const { error } = await supabase.storage.from("banner-images").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error("The image couldn't be uploaded. Please try again.");
  return path;
}

function OwnerBanners() {
  const list = useServerFn(ownerListPromoBanners);
  const save = useServerFn(ownerSavePromoBanner);
  const remove = useServerFn(ownerDeletePromoBanner);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [desktopFile, setDesktopFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const banners = useQuery({ queryKey: ["owner-banners"], queryFn: () => list() });
  const menu = useQuery(menuQueryOptions());
  const desktopPreview = useMemo(
    () => (desktopFile ? URL.createObjectURL(desktopFile) : form.desktopUrl),
    [desktopFile, form.desktopUrl],
  );
  const mobilePreview = useMemo(
    () => (mobileFile ? URL.createObjectURL(mobileFile) : form.mobileUrl),
    [mobileFile, form.mobileUrl],
  );

  useEffect(() => {
    return () => {
      if (desktopPreview?.startsWith("blob:")) URL.revokeObjectURL(desktopPreview);
    };
  }, [desktopPreview]);
  useEffect(() => {
    return () => {
      if (mobilePreview?.startsWith("blob:")) URL.revokeObjectURL(mobilePreview);
    };
  }, [mobilePreview]);

  if (banners.isLoading) return <Skeleton className="h-96 w-full" />;
  if (banners.error) {
    return (
      <EmptyState
        title="Couldn't load banners"
        description="Something went wrong loading your banners."
        action={<Button onClick={() => void banners.refetch()}>Try again</Button>}
      />
    );
  }

  const rows = banners.data ?? [];
  const reset = () => {
    setForm(emptyForm());
    setDesktopFile(null);
    setMobileFile(null);
  };
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["owner-banners"] }),
      queryClient.invalidateQueries({ queryKey: ["restaurant"] }),
    ]);
  };
  const chooseFile =
    (kind: "desktop" | "mobile") => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      if (!file) return;
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        toast.error("Choose a JPG, PNG or WebP image");
        event.target.value = "";
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast.error("Banner images must be 8 MB or smaller");
        event.target.value = "";
        return;
      }
      if (kind === "desktop") setDesktopFile(file);
      else setMobileFile(file);
    };

  const submit = async () => {
    if (!desktopFile && !form.desktopPath) {
      toast.error("Upload a desktop banner image");
      return;
    }
    if (["category", "product", "custom"].includes(form.destination) && !form.target.trim()) {
      toast.error("Choose where this banner should open");
      return;
    }

    setSaving(true);
    const newlyUploaded: string[] = [];
    try {
      const desktopPath = desktopFile
        ? await uploadBanner(desktopFile, "desktop").then((path) => {
            newlyUploaded.push(path);
            return path;
          })
        : form.desktopPath;
      const mobilePath = mobileFile
        ? await uploadBanner(mobileFile, "mobile").then((path) => {
            newlyUploaded.push(path);
            return path;
          })
        : form.mobilePath;
      if (!desktopPath) return;

      await save({
        data: {
          id: form.id,
          desktopImagePath: desktopPath,
          mobileImagePath: mobilePath,
          clickHref: clickHref(form),
          isActive: form.isActive,
          sortOrder: Number(form.sortOrder) || 0,
        },
      });
      await refresh();
      reset();
      toast.success("Banner saved");
    } catch (error) {
      if (newlyUploaded.length > 0) {
        await supabase.storage.from("banner-images").remove(newlyUploaded);
      }
      toast.error(error instanceof Error ? error.message : "Couldn't save this banner");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5 p-4">
          <div>
            <h2 className="font-display text-base font-bold">
              {form.id ? "Edit banner" : "New banner"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload the finished artwork. No text will be added over it.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ImagePicker
              id="banner-desktop"
              label="Desktop banner image"
              required
              preview={desktopPreview}
              onChange={chooseFile("desktop")}
            />
            <ImagePicker
              id="banner-mobile"
              label="Mobile banner image (optional)"
              preview={mobilePreview ?? desktopPreview}
              fallback={!mobilePreview && Boolean(desktopPreview)}
              onChange={chooseFile("mobile")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>When clicked</Label>
              <Select
                value={form.destination}
                onValueChange={(value: Destination) =>
                  setForm({ ...form, destination: value, target: "" })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No action</SelectItem>
                  <SelectItem value="menu">Menu</SelectItem>
                  <SelectItem value="offers">Offers</SelectItem>
                  <SelectItem value="category">Category</SelectItem>
                  <SelectItem value="product">Specific menu item</SelectItem>
                  <SelectItem value="custom">Custom URL</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.destination === "category" ? (
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.target} onValueChange={(target) => setForm({ ...form, target })}>
                  <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
                  <SelectContent>
                    {(menu.data?.categories ?? []).map((category) => (
                      <SelectItem key={category.id} value={category.slug}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {form.destination === "product" ? (
              <div className="space-y-1.5">
                <Label>Menu item</Label>
                <Select value={form.target} onValueChange={(target) => setForm({ ...form, target })}>
                  <SelectTrigger><SelectValue placeholder="Choose menu item" /></SelectTrigger>
                  <SelectContent>
                    {(menu.data?.products ?? []).map((product) => (
                      <SelectItem key={product.id} value={product.slug}>{product.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {form.destination === "custom" ? (
              <div className="space-y-1.5">
                <Label htmlFor="banner-url">Custom URL</Label>
                <Input
                  id="banner-url"
                  value={form.target}
                  placeholder="https://example.com"
                  onChange={(event) => setForm({ ...form, target: event.target.value })}
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="banner-order">Display order</Label>
              <Input
                id="banner-order"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={form.sortOrder}
                onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
              />
            </div>

            <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <Label htmlFor="banner-active">Active</Label>
              <Switch
                id="banner-active"
                checked={form.isActive}
                onCheckedChange={(isActive) => setForm({ ...form, isActive })}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
              Save banner
            </Button>
            {form.id ? <Button variant="outline" onClick={reset}>Cancel</Button> : null}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="font-display text-base font-bold">Banners</h2>
        {rows.length === 0 ? (
          <EmptyState
            title="No banners yet"
            description="The home carousel will keep showing featured menu items."
          />
        ) : (
          rows.map((banner) => (
            <Card key={banner.id}>
              <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="aspect-[16/7] w-full shrink-0 overflow-hidden rounded-md bg-muted sm:w-44">
                  {banner.desktopImageUrl ? (
                    <img src={banner.desktopImageUrl} alt="Promotional banner" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                      Existing text banner — add an image to update it
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={banner.isActive ? "default" : "secondary"}>
                      {banner.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">Order {banner.sortOrder}</span>
                  </div>
                  <p className="mt-2 truncate text-sm">
                    {banner.ctaHref ? `Opens ${banner.ctaHref}` : "No click action"}
                  </p>
                </div>
                <div className="flex gap-2 self-end sm:self-auto">
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Edit banner"
                    onClick={() => {
                      setDesktopFile(null);
                      setMobileFile(null);
                      setForm(toForm(banner));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete banner"
                    onClick={async () => {
                      try {
                        await remove({ data: { id: banner.id } });
                        await refresh();
                        if (form.id === banner.id) reset();
                        toast.success("Banner deleted");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Couldn't delete this banner");
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function ImagePicker({
  id,
  label,
  preview,
  required = false,
  fallback = false,
  onChange,
}: {
  id: string;
  label: string;
  preview: string | null;
  required?: boolean;
  fallback?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{required ? " *" : ""}</Label>
      <label
        htmlFor={id}
        className="relative flex aspect-[16/7] cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted"
      >
        {preview ? (
          <>
            <img src={preview} alt="Banner preview" className="size-full object-cover" />
            <span className="absolute bottom-2 right-2 rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-foreground">
              {fallback ? "Desktop fallback" : "Change image"}
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <ImagePlus className="size-6" />
            Choose image
          </span>
        )}
      </label>
      <Input id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onChange} />
      <p className="text-xs text-muted-foreground">JPG, PNG or WebP · up to 8 MB</p>
    </div>
  );
}