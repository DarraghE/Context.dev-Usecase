import tzlookup from "@photostructure/tz-lookup";

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** IANA zone for coordinates, offline (no external call). */
export function tzFor(lat: number | null, lng: number | null, fallback: string): string {
  if (lat === null || lng === null) return fallback;
  try {
    return tzlookup(lat, lng);
  } catch {
    return fallback;
  }
}

/** Local calendar date (YYYY-MM-DD) of an instant in a zone. */
export function localDateIn(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Small offline gazetteer, used to name the city around a venue so that place lookups
 * sent to Context.dev carry a venue name and city only, never coordinates (P10).
 */
const CITIES: { name: string; country: string; lat: number; lng: number; aliases?: string[] }[] = [
  { name: "Helsinki", country: "Finland", lat: 60.1699, lng: 24.9384, aliases: ["Helsingfors"] },
  { name: "Espoo", country: "Finland", lat: 60.2055, lng: 24.6559 },
  { name: "Tampere", country: "Finland", lat: 61.4978, lng: 23.761 },
  { name: "Turku", country: "Finland", lat: 60.4518, lng: 22.2666, aliases: ["Åbo"] },
  { name: "Oulu", country: "Finland", lat: 65.0121, lng: 25.4651 },
  { name: "Rovaniemi", country: "Finland", lat: 66.5039, lng: 25.7294 },
  { name: "Stockholm", country: "Sweden", lat: 59.3293, lng: 18.0686 },
  { name: "Tallinn", country: "Estonia", lat: 59.437, lng: 24.7536 },
  { name: "Copenhagen", country: "Denmark", lat: 55.6761, lng: 12.5683, aliases: ["København"] },
  { name: "Oslo", country: "Norway", lat: 59.9139, lng: 10.7522 },
  { name: "Edinburgh", country: "United Kingdom", lat: 55.9533, lng: -3.1883 },
  { name: "Glasgow", country: "United Kingdom", lat: 55.8642, lng: -4.2518 },
  { name: "London", country: "United Kingdom", lat: 51.5072, lng: -0.1276 },
  { name: "Manchester", country: "United Kingdom", lat: 53.4808, lng: -2.2426 },
  { name: "Dublin", country: "Ireland", lat: 53.3498, lng: -6.2603 },
  { name: "Paris", country: "France", lat: 48.8566, lng: 2.3522 },
  { name: "Lyon", country: "France", lat: 45.764, lng: 4.8357 },
  { name: "Barcelona", country: "Spain", lat: 41.3874, lng: 2.1686 },
  { name: "Madrid", country: "Spain", lat: 40.4168, lng: -3.7038 },
  { name: "Lisbon", country: "Portugal", lat: 38.7223, lng: -9.1393, aliases: ["Lisboa"] },
  { name: "Porto", country: "Portugal", lat: 41.1579, lng: -8.6291 },
  { name: "Rome", country: "Italy", lat: 41.9028, lng: 12.4964, aliases: ["Roma"] },
  { name: "Naples", country: "Italy", lat: 40.8518, lng: 14.2681, aliases: ["Napoli"] },
  { name: "Florence", country: "Italy", lat: 43.7696, lng: 11.2558, aliases: ["Firenze"] },
  { name: "Milan", country: "Italy", lat: 45.4642, lng: 9.19, aliases: ["Milano"] },
  { name: "Venice", country: "Italy", lat: 45.4408, lng: 12.3155, aliases: ["Venezia"] },
  { name: "Berlin", country: "Germany", lat: 52.52, lng: 13.405 },
  { name: "Munich", country: "Germany", lat: 48.1351, lng: 11.582, aliases: ["München"] },
  { name: "Amsterdam", country: "Netherlands", lat: 52.3676, lng: 4.9041 },
  { name: "Brussels", country: "Belgium", lat: 50.8503, lng: 4.3517, aliases: ["Bruxelles"] },
  { name: "Vienna", country: "Austria", lat: 48.2082, lng: 16.3738, aliases: ["Wien"] },
  { name: "Prague", country: "Czechia", lat: 50.0755, lng: 14.4378, aliases: ["Praha"] },
  { name: "Budapest", country: "Hungary", lat: 47.4979, lng: 19.0402 },
  { name: "Athens", country: "Greece", lat: 37.9838, lng: 23.7275 },
  { name: "Istanbul", country: "Türkiye", lat: 41.0082, lng: 28.9784 },
  { name: "New York", country: "United States", lat: 40.7128, lng: -74.006 },
  { name: "San Francisco", country: "United States", lat: 37.7749, lng: -122.4194 },
  { name: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503 },
  { name: "Bangkok", country: "Thailand", lat: 13.7563, lng: 100.5018 },
];

export function nearestCity(lat: number | null, lng: number | null, maxKm = 60): { label: string; name: string; aliases: string[] } | null {
  if (lat === null || lng === null) return null;
  let best: (typeof CITIES)[number] | null = null;
  let bestKm = Infinity;
  for (const c of CITIES) {
    const d = haversineKm({ lat, lng }, c);
    if (d < bestKm) {
      bestKm = d;
      best = c;
    }
  }
  if (!best || bestKm > maxKm) return null;
  return { label: `${best.name}, ${best.country}`, name: best.name, aliases: [best.name, ...(best.aliases ?? [])] };
}
