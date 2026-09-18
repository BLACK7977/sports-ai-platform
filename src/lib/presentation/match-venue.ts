import type { MatchMetadata } from "@/types/db/tables";

export type VenueView = { name: string; city?: string; capacity?: number; surface?: string };
export function persistedVenueView(metadata: MatchMetadata | null | undefined): VenueView | null {
  const name = metadata?.venue_name?.trim();
  if (!name) return null;
  return {
    name,
    ...(metadata?.venue_city?.trim() ? { city: metadata.venue_city.trim() } : {}),
    ...(typeof metadata?.venue_capacity === "number" && metadata.venue_capacity > 0 ? { capacity: metadata.venue_capacity } : {}),
    ...(metadata?.venue_surface?.trim() ? { surface: metadata.venue_surface.trim() } : {}),
  };
}
