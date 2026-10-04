/**
 * Weather — Open-Meteo forecast (no key) for the browser's coordinates,
 * reverse-geocoded via Nominatim. Classifies conditions into the six states
 * the 3D world renders (`detail.condition` + `detail.intensity`).
 *
 * Query: `?lat=&lon=` (from navigator.geolocation) or `?ip=1` to fall back to
 * IP geolocation (ipapi.co) when the browser denied location.
 */
import { emptyPayload, type ModulePayload } from "@/core/payload";
import type { WeatherCondition, WeatherDetail } from "@/modules/types";
import { errorMessage, getJSON, NEXUS_UA } from "./http";

const SOURCE = "Open-Meteo";
const LOCATION_HINT =
  "Weather needs your location: allow location access for this site in the browser (address bar → site settings → Location → Allow), then reload.";

/** WMO weather interpretation codes → words. */
const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Light showers", 81: "Showers", 82: "Violent showers", 85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail",
};
export const describeCode = (code: number) => WMO[code] ?? "Unknown";

/**
 * Collapse a WMO code (+ cloud cover %, precipitation mm) into one of the
 * six environment states. Pure.
 */
export function classifyCondition(code: number, cloudCover: number, precipitation: number): WeatherCondition {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (precipitation > 0.1) return "rain";
  if (code === 3) return "clouds";
  if (code === 2) return cloudCover >= 60 ? "clouds" : "sun";
  if (code <= 1) return cloudCover >= 85 ? "clouds" : "sun";
  return cloudCover >= 60 ? "clouds" : "sun";
}

/** 0..1 strength of a classified condition. Pure. */
export function conditionIntensity(condition: WeatherCondition, code: number, cloudCover: number, precipitation: number): number {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const byCode: Record<number, number> = {
    45: 0.6, 48: 0.8,
    51: 0.15, 53: 0.25, 55: 0.35, 56: 0.25, 57: 0.4,
    61: 0.35, 63: 0.6, 65: 0.9, 66: 0.5, 67: 0.9,
    71: 0.3, 73: 0.6, 75: 0.9, 77: 0.35, 85: 0.5, 86: 0.9,
    80: 0.4, 81: 0.65, 82: 1,
    95: 0.8, 96: 0.9, 99: 1,
  };
  switch (condition) {
    case "sun": return clamp(1 - cloudCover / 100);
    case "clouds": return clamp(cloudCover / 100);
    case "rain":
    case "snow":
      // Measured precipitation (mm/h) wins when it is heavier than the code suggests.
      return clamp(Math.max(byCode[code] ?? 0.3, precipitation / 8));
    default: return clamp(byCode[code] ?? 0.7);
  }
}

interface ForecastResponse {
  timezone: string;
  current: {
    time: string; temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number;
    precipitation: number; rain: number; cloud_cover: number; wind_speed_10m: number; weather_code: number; is_day: number;
  };
  current_units: { temperature_2m: string; wind_speed_10m: string; precipitation: string };
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: (number | null)[] };
  daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[] };
}

async function placeName(lat: number, lon: number): Promise<string | undefined> {
  try {
    const r = await getJSON<{ address?: Record<string, string> }>(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lon}`,
      { headers: { "user-agent": NEXUS_UA, "accept-language": "en" }, timeoutMs: 4000, revalidate: 86_400 },
    );
    const a = r.address ?? {};
    const place = a.city ?? a.town ?? a.village ?? a.suburb ?? a.municipality ?? a.county ?? a.state;
    return place ? (a.country_code ? `${place}, ${a.country_code.toUpperCase()}` : place) : undefined;
  } catch {
    return undefined;
  }
}

async function ipLocation(): Promise<{ lat: number; lon: number; name?: string } | null> {
  try {
    const r = await getJSON<{ latitude?: number; longitude?: number; city?: string; country_code?: string; error?: boolean }>(
      "https://ipapi.co/json/",
      { headers: { "user-agent": NEXUS_UA }, timeoutMs: 4000, revalidate: 3600 },
    );
    if (r.error || typeof r.latitude !== "number" || typeof r.longitude !== "number") return null;
    return { lat: r.latitude, lon: r.longitude, name: r.city ? `${r.city}${r.country_code ? `, ${r.country_code}` : ""}` : undefined };
  } catch {
    return null;
  }
}

export async function fetchWeather(req: Request): Promise<ModulePayload<WeatherDetail>> {
  const q = new URL(req.url).searchParams;
  let lat = parseFloat(q.get("lat") ?? "");
  let lon = parseFloat(q.get("lon") ?? "");
  let approximate = false;
  let ipName: string | undefined;

  const valid = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if (!valid) {
    if (q.get("ip") !== "1") return emptyPayload("weather", "unconfigured", SOURCE, LOCATION_HINT) as ModulePayload<WeatherDetail>;
    const ip = await ipLocation();
    if (!ip) {
      return emptyPayload("weather", "unconfigured", SOURCE, `${LOCATION_HINT} (IP-based location via ipapi.co also failed.)`) as ModulePayload<WeatherDetail>;
    }
    ({ lat, lon } = ip);
    ipName = ip.name;
    approximate = true;
  }
  // ~1 km precision is plenty for a forecast and keeps the cache key stable.
  lat = Math.round(lat * 100) / 100;
  lon = Math.round(lon * 100) / 100;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,cloud_cover,wind_speed_10m,weather_code,is_day" +
    "&hourly=temperature_2m,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=7";

  let f: ForecastResponse;
  let name: string | undefined;
  try {
    [f, name] = await Promise.all([getJSON<ForecastResponse>(url, { timeoutMs: 8000, revalidate: 300 }), placeName(lat, lon)]);
  } catch (e) {
    return emptyPayload("weather", "error", SOURCE, `${errorMessage(e)}. Open-Meteo is keyless — check that api.open-meteo.com is reachable from the server.`) as ModulePayload<WeatherDetail>;
  }

  const c = f.current;
  const condition = classifyCondition(c.weather_code, c.cloud_cover, c.precipitation);
  const intensity = conditionIntensity(condition, c.weather_code, c.cloud_cover, c.precipitation);

  // Next 24 hours from the current hour (times are local to the location).
  const hourKey = c.time.slice(0, 13);
  let from = f.hourly.time.findIndex((t) => t.slice(0, 13) === hourKey);
  if (from < 0) from = 0;
  const hourly = f.hourly.time.slice(from, from + 24).map((time, i) => ({
    time,
    temperature: f.hourly.temperature_2m[from + i],
    precipProbability: f.hourly.precipitation_probability[from + i] ?? 0,
  }));

  const daily = f.daily.time.map((date, i) => {
    const code = f.daily.weather_code[i];
    return {
      date,
      max: f.daily.temperature_2m_max[i],
      min: f.daily.temperature_2m_min[i],
      code,
      condition: classifyCondition(code, code === 3 ? 100 : code === 2 ? 50 : 0, 0),
      description: describeCode(code),
    };
  });

  const units = {
    temperature: f.current_units.temperature_2m ?? "°C",
    wind: f.current_units.wind_speed_10m ?? "km/h",
    precipitation: f.current_units.precipitation ?? "mm",
  };
  const place = name ?? ipName;
  const description = describeCode(c.weather_code);
  const today = daily[0];
  const rainSoon = hourly.slice(0, 12).reduce((m, h) => Math.max(m, h.precipProbability), 0);
  const t = (n: number) => `${Math.round(n)}${units.temperature}`;

  const detail: WeatherDetail = {
    condition,
    intensity,
    isDay: c.is_day === 1,
    location: { lat, lon, name: place, approximate },
    timezone: f.timezone,
    current: {
      time: c.time,
      temperature: c.temperature_2m,
      apparent: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      precipitation: c.precipitation,
      rain: c.rain,
      cloudCover: c.cloud_cover,
      windSpeed: c.wind_speed_10m,
      code: c.weather_code,
      description,
    },
    hourly,
    daily,
    units,
  };

  return {
    id: "weather",
    status: "live",
    fetchedAt: Date.now(),
    source: `${SOURCE}${place ? ` · ${place}` : ""}${approximate ? " (approx. by IP)" : ""}`,
    headline: { label: place ?? description, value: t(c.temperature_2m) },
    metrics: [
      { label: "Feels like", value: t(c.apparent_temperature) },
      { label: "Conditions", value: description },
      { label: "High / Low", value: today ? `${t(today.max)} / ${t(today.min)}` : "—" },
      { label: "Rain next 12h", value: `${rainSoon}%` },
      { label: "Wind", value: `${Math.round(c.wind_speed_10m)} ${units.wind}` },
      { label: "Humidity", value: `${c.relative_humidity_2m}%` },
    ],
    series: hourly.map((h) => h.temperature),
    summary: `${description}, ${t(c.temperature_2m)} (feels ${t(c.apparent_temperature)})${place ? ` in ${place}` : ""}; ${today ? `high ${t(today.max)}, low ${t(today.min)}, ` : ""}${rainSoon}% chance of rain in the next 12 hours.`,
    detail,
  };
}
