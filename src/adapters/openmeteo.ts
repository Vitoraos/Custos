// Open-Meteo: geocode a city, then current conditions. No key. 10-min cache.
// Failure -> throw; the tool returns outcome "error" + an honest say.
import { z } from "zod";
import { fetchJson, TtlCache } from "./http.js";

const geoSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        country: z.string().optional(),
        latitude: z.number(),
        longitude: z.number(),
      }),
    )
    .optional(),
});
const fxSchema = z.object({
  current: z
    .object({
      time: z.string(),
      temperature_2m: z.number(),
      weather_code: z.number(),
    })
    .optional(),
  hourly: z
    .object({
      time: z.array(z.string()),
      temperature_2m: z.array(z.number()),
      weather_code: z.array(z.number()),
    })
    .optional(),
});

export interface Weather {
  place: string;
  tempC: number;
  code: number;
  desc: string;
  fetchedAt: string;
  source: "open-meteo";
  forTime?: string; // ISO hour this forecast is for (present when atMs given)
}

const CODE_DESC: Record<number, string> = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "icy fog",
  51: "light drizzle",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  71: "light snow",
  73: "snow",
  75: "heavy snow",
  80: "light showers",
  81: "showers",
  82: "violent showers",
  95: "thunderstorm",
  96: "storm with hail",
  99: "storm with heavy hail",
};

const cache = new TtlCache<Weather>();
const BASE = process.env.OPENMETEO_BASE_URL ?? "https://api.open-meteo.com";
const GEO =
  process.env.OPENMETEO_GEO_URL ?? "https://geocoding-api.open-meteo.com";

export async function getWeather(
  city: string,
  atMs?: number | null,
): Promise<Weather> {
  const key = `${city.toLowerCase().trim()}|${atMs ? new Date(atMs).toISOString().slice(0, 13) : "now"}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const geo = await fetchJson(
    `${GEO}/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
    geoSchema,
  );
  const g = geo.results?.[0];
  if (!g) throw new Error(`unknown place: ${city}`);
  const place = `${g.name}${g.country ? `, ${g.country}` : ""}`;
  if (atMs == null) {
    const fx = await fetchJson(
      `${BASE}/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&current=temperature_2m,weather_code`,
      fxSchema,
    );
    if (!fx.current) throw new Error("no current conditions");
    const w: Weather = {
      place,
      tempC: Math.round(fx.current.temperature_2m * 10) / 10,
      code: fx.current.weather_code,
      desc: CODE_DESC[fx.current.weather_code] ?? "unknown",
      fetchedAt: new Date().toISOString(),
      source: "open-meteo",
    };
    cache.set(key, w);
    return w;
  }
  // Hourly forecast: nearest hour at or after the requested time (max 16 days out).
  // timezone=UTC keeps the returned hour labels unambiguous.
  const fx = await fetchJson(
    `${BASE}/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&hourly=temperature_2m,weather_code&forecast_days=16&timezone=UTC`,
    fxSchema,
  );
  const h = fx.hourly;
  if (!h) throw new Error("no hourly forecast");
  const want = Math.floor(atMs / 3600000);
  let best = -1;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < h.time.length; i++) {
    const t = Date.parse(`${h.time[i]}:00Z`);
    if (Number.isNaN(t)) continue;
    const diff = Math.abs(Math.floor(t / 3600000) - want);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  if (best < 0) throw new Error("no matching hour");
  const w: Weather = {
    place,
    tempC: Math.round(h.temperature_2m[best] * 10) / 10,
    code: h.weather_code[best],
    desc: CODE_DESC[h.weather_code[best]] ?? "unknown",
    fetchedAt: new Date().toISOString(),
    source: "open-meteo",
    forTime: new Date(`${h.time[best]}:00Z`).toISOString(),
  };
  cache.set(key, w);
  return w;
}
