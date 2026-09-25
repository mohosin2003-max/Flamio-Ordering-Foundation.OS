import { useState } from "react";
import { Loader2, Navigation } from "lucide-react";
import { toast } from "sonner";

import { MapPicker } from "@/components/map/MapPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reverseGeocode } from "@/lib/customer-location";

const MAP_FALLBACK = { lat: 24.4449, lng: 90.7766 };

export type LatLng = { lat: number; lng: number };

/**
 * Map pin + live location + Location/Area Name. Reuses the existing
 * MapPicker and reverseGeocode; the values map onto the existing address
 * latitude/longitude and `area` fields.
 */
export function LocationFields({
  point,
  onPoint,
  area,
  onArea,
  onGeocoded,
  areaRequired = false,
}: {
  point: LatLng | null;
  onPoint: (p: LatLng) => void;
  area: string;
  onArea: (v: string) => void;
  onGeocoded?: (label: string) => void;
  areaRequired?: boolean;
}) {
  const [locating, setLocating] = useState(false);

  function useLive() {
    if (!("geolocation" in navigator)) {
      toast.error("Your device can't share its location. Please pick it on the map.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        onPoint({ lat, lng });
        try {
          const label = await reverseGeocode(lat, lng);
          if (label) onGeocoded?.(label);
        } catch {
          /* the pin is enough on its own */
        }
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error("We couldn't get your location. Please pick it on the map instead.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" size="sm" disabled={locating} onClick={useLive}>
        {locating ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Navigation className="size-4 text-primary" aria-hidden="true" />
        )}
        {locating ? "Detecting your location…" : "Use My Current Location"}
      </Button>
      <p className="text-xs text-muted-foreground">Or tap the map to place / move your pin.</p>
      <MapPicker
        center={point ?? MAP_FALLBACK}
        marker={point}
        onPick={(lat, lng) => onPoint({ lat, lng })}
        height={260}
      />
      <div className="space-y-2">
        <Label htmlFor="loc-area">
          Location / Area Name{areaRequired ? "" : " (optional)"}
        </Label>
        <Input
          id="loc-area"
          value={area}
          onChange={(e) => onArea(e.target.value)}
          placeholder="e.g. Sholakia"
          maxLength={120}
        />
      </div>
    </div>
  );
}
