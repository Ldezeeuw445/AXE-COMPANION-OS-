"use server";

/**
 * Weather service for AXE morning briefs.
 *
 * Uses Open-Meteo (free, no API key) to fetch current weather and a short
 * day summary for a given latitude/longitude. Falls back to timezone-based
 * default coordinates when no explicit location is available.
 */

export interface WeatherSnapshot {
  location: string;
  tempC: number;
  condition: string;
  icon: string;
  windKmh: number;
  precipitationChance: number;
  summary: string;
}

const TIMEZONE_DEFAULTS: Record<string, { lat: number; lon: number; name: string }> = {
  "Europe/Amsterdam": { lat: 52.37, lon: 4.9, name: "Amsterdam" },
  "Europe/London": { lat: 51.51, lon: -0.13, name: "London" },
  "Europe/Paris": { lat: 48.86, lon: 2.35, name: "Paris" },
  "Europe/Berlin": { lat: 52.52, lon: 13.41, name: "Berlin" },
  "America/New_York": { lat: 40.71, lon: -74.01, name: "New York" },
  "America/Chicago": { lat: 41.88, lon: -87.63, name: "Chicago" },
  "America/Denver": { lat: 39.74, lon: -104.99, name: "Denver" },
  "America/Los_Angeles": { lat: 34.05, lon: -118.24, name: "Los Angeles" },
  "America/Toronto": { lat: 43.65, lon: -79.38, name: "Toronto" },
  "Asia/Tokyo": { lat: 35.68, lon: 139.69, name: "Tokyo" },
  "Asia/Shanghai": { lat: 31.23, lon: 121.47, name: "Shanghai" },
  "Asia/Singapore": { lat: 1.35, lon: 103.82, name: "Singapore" },
  "Asia/Dubai": { lat: 25.2, lon: 55.27, name: "Dubai" },
  "Asia/Hong_Kong": { lat: 22.32, lon: 114.17, name: "Hong Kong" },
  "Australia/Sydney": { lat: -33.87, lon: 151.21, name: "Sydney" },
  "Pacific/Auckland": { lat: -36.85, lon: 174.76, name: "Auckland" },
};

function wmoLabel(code: number): { condition: string; icon: string } {
  // WMO Weather interpretation codes (Open-Meteo)
  if (code === 0) return { condition: "clear sky", icon: "☀️" };
  if (code === 1 || code === 2 || code === 3)
    return { condition: "partly cloudy", icon: "⛅" };
  if (code === 45 || code === 48) return { condition: "foggy", icon: "🌫️" };
  if (code >= 51 && code <= 55) return { condition: "drizzle", icon: "🌦️" };
  if (code >= 61 && code <= 65) return { condition: "rain", icon: "🌧️" };
  if (code >= 71 && code <= 77) return { condition: "snow", icon: "🌨️" };
  if (code >= 80 && code <= 82) return { condition: "showers", icon: "🌦️" };
  if (code >= 85 && code <= 86) return { condition: "snow showers", icon: "🌨️" };
  if (code >= 95) return { condition: "thunderstorm", icon: "⛈️" };
  return { condition: "overcast", icon: "☁️" };
}

function resolveLocation(input?: { lat?: number; lon?: number; name?: string } | null, timezone?: string | null) {
  if (input?.lat != null && input?.lon != null) {
    return {
      lat: input.lat,
      lon: input.lon,
      name: input.name || timezone || "your location",
    };
  }
  const fallback = timezone ? TIMEZONE_DEFAULTS[timezone] : undefined;
  return fallback || { lat: 52.37, lon: 4.9, name: "Amsterdam" };
}

export async function fetchWeatherForBrief(
  locationInput?: { lat?: number; lon?: number; name?: string } | null,
  timezone?: string | null
): Promise<WeatherSnapshot | null> {
  const loc = resolveLocation(locationInput, timezone);

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(loc.lat));
    url.searchParams.set("longitude", String(loc.lon));
    url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m,precipitation_probability");
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "1");

    const res = await fetch(url.toString(), { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`);
    const data = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
        precipitation_probability?: number;
      };
      daily?: {
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
      };
    };

    const current = data.current;
    const daily = data.daily;
    if (!current) return null;

    const { condition, icon } = wmoLabel(current.weather_code ?? 0);
    const maxTemp = daily?.temperature_2m_max?.[0];
    const minTemp = daily?.temperature_2m_min?.[0];
    const summaryParts: string[] = [];
    summaryParts.push(`${icon} ${condition}`);
    if (maxTemp != null && minTemp != null) {
      summaryParts.push(`high ${Math.round(maxTemp)}°C, low ${Math.round(minTemp)}°C`);
    }
    const rainChance = current.precipitation_probability ?? daily?.precipitation_probability_max?.[0] ?? 0;
    if (rainChance > 20) summaryParts.push(`${rainChance}% rain`);

    return {
      location: loc.name,
      tempC: Math.round(current.temperature_2m ?? 0),
      condition,
      icon,
      windKmh: Math.round(current.wind_speed_10m ?? 0),
      precipitationChance: rainChance,
      summary: summaryParts.join(" · "),
    };
  } catch (err) {
    console.warn("[Weather] Failed to fetch weather:", err);
    return null;
  }
}
