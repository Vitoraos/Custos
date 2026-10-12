// Household locale: home city / timezone / coordinates, stored as facts with
// a fixed convention so Alexa-style clients and tools share one source:
//   "Home city: Lagos, Nigeria" / "Home timezone: Africa/Lagos"
//   "Home coordinates: 6.5244, 3.3792"
// Unknown or invalid -> safe defaults (UTC, no city). Never throws.
import type { Store } from "../storage/store.js";

export interface Locale {
  city: string | null;
  tz: string;
  lat: number | null;
  lon: number | null;
}
export const DEFAULT_LOCALE: Locale = {
  city: null,
  tz: "UTC",
  lat: null,
  lon: null,
};

function firstLine(text: string, prefix: RegExp): string | null {
  const m = text.match(prefix);
  return m ? m[1].trim().slice(0, 120) : null;
}

export async function getLocale(store: Store, userId: string): Promise<Locale> {
  const out: Locale = { ...DEFAULT_LOCALE };
  try {
    for (const m of await store.listMemories(userId)) {
      if (m.kind !== "fact" || m.status !== "active") continue;
      const text = (m.payload as { text?: unknown }).text;
      if (typeof text !== "string") continue;
      const city = firstLine(text, /^home city:\s*(.+)$/i);
      if (city) out.city = city;
      const tz = firstLine(text, /^home (?:timezone|time ?zone):\s*(.+)$/i);
      if (tz) {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: tz });
          out.tz = tz;
        } catch {
          // Invalid IANA zone: keep current (default UTC).
        }
      }
      const coords = firstLine(text, /^home coordinates:\s*(.+)$/i);
      if (coords) {
        const [lat, lon] = coords.split(",").map((s) => Number(s.trim()));
        if (
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          Math.abs(lat) <= 90 &&
          Math.abs(lon) <= 180
        ) {
          out.lat = lat;
          out.lon = lon;
        }
      }
    }
  } catch {
    return { ...DEFAULT_LOCALE };
  }
  return out;
}

export interface RequestContext {
  nowUtc: string;
  nowLocal: string;
  weekday: string;
  tz: string;
  city: string | null;
}

export function requestContext(now: Date, locale: Locale): RequestContext {
  const fmt = (opts: Intl.DateTimeFormatOptions): string => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        ...opts,
        timeZone: locale.tz,
      }).format(now);
    } catch {
      return now.toISOString();
    }
  };
  return {
    nowUtc: now.toISOString(),
    nowLocal: fmt({ dateStyle: "full", timeStyle: "short" }),
    weekday: fmt({ weekday: "long" }),
    tz: locale.tz,
    city: locale.city,
  };
}
