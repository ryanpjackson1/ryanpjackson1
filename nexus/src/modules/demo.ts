import type { ModuleId } from "./registry";

/**
 * DEMO DATA. Every value below is invented for this milestone so the panels
 * have something readable to show. Nothing here comes from an account, an
 * API or a live feed, and the UI labels it that way everywhere it appears.
 */
export const DEMO_SOURCE = "Demo data — not connected to any account or live feed";

export interface DemoMetric { label: string; value: string; trend?: "up" | "down" | "flat" }
export interface DemoRow { primary: string; secondary?: string; value?: string }
export interface DemoSection { title: string; rows: DemoRow[] }

export interface ModuleDemo {
  /** Always true in this milestone — the UI asserts on it. */
  demo: true;
  source: typeof DEMO_SOURCE;
  headline: { label: string; value: string };
  metrics: DemoMetric[];
  /** Sparkline values, oldest → newest. */
  series: number[];
  sections: DemoSection[];
}

const d = (x: Omit<ModuleDemo, "demo" | "source">): ModuleDemo => ({ demo: true, source: DEMO_SOURCE, ...x });

export const DEMO: Record<ModuleId, ModuleDemo> = {
  instagram: d({
    headline: { label: "Followers (sample)", value: "12,480" },
    metrics: [
      { label: "Reach · 28d", value: "84.2K", trend: "up" },
      { label: "Engagement", value: "4.1%", trend: "flat" },
      { label: "Reels", value: "36" },
    ],
    series: [11820, 11905, 11960, 12010, 12102, 12150, 12233, 12301, 12388, 12480],
    sections: [
      { title: "Top content (sample)", rows: [
        { primary: "Studio walkthrough", secondary: "Reel · 3 days ago", value: "18.4K plays" },
        { primary: "Lighting test", secondary: "Post · 1 week ago", value: "2.1K likes" },
        { primary: "Process timelapse", secondary: "Reel · 2 weeks ago", value: "9.7K plays" },
      ] },
    ],
  }),
  stocks: d({
    headline: { label: "Portfolio value (sample)", value: "$48,920" },
    metrics: [
      { label: "Day", value: "+0.8%", trend: "up" },
      { label: "Unrealised P/L", value: "+$6,140", trend: "up" },
      { label: "Holdings", value: "7" },
    ],
    series: [46200, 46900, 46400, 47300, 47800, 47100, 48000, 48500, 48300, 48920],
    sections: [
      { title: "Holdings (sample tickers, invented prices)", rows: [
        { primary: "ACME", secondary: "Technology · 32%", value: "+1.4%" },
        { primary: "GLOBEX", secondary: "Energy · 21%", value: "−0.6%" },
        { primary: "INITECH", secondary: "Software · 18%", value: "+0.9%" },
        { primary: "UMBRA", secondary: "Industrials · 14%", value: "+0.2%" },
      ] },
    ],
  }),
  projects: d({
    headline: { label: "Active projects (sample)", value: "4" },
    metrics: [
      { label: "Due this week", value: "2" },
      { label: "Open tasks", value: "23" },
      { label: "Shipped · 30d", value: "5", trend: "up" },
    ],
    series: [2, 3, 3, 4, 3, 5, 4, 6, 5, 7],
    sections: [
      { title: "Projects (sample)", rows: [
        { primary: "NEXUS milestone 1", secondary: "Spatial shell", value: "In progress" },
        { primary: "Portfolio site", secondary: "Design refresh", value: "Review" },
        { primary: "Field recorder", secondary: "Hardware prototype", value: "Planning" },
      ] },
    ],
  }),
  sports: d({
    headline: { label: "Next fixture (sample)", value: "Sat 15:00" },
    metrics: [
      { label: "League position", value: "4th" },
      { label: "Form", value: "W W D L W" },
      { label: "Points", value: "38" },
    ],
    series: [3, 6, 7, 7, 10, 13, 13, 16, 19, 20],
    sections: [
      { title: "Results (sample teams)", rows: [
        { primary: "Northbridge 2 – 1 Eastvale", secondary: "Full time" },
        { primary: "Harbour City 0 – 0 Northbridge", secondary: "Full time" },
        { primary: "Northbridge 3 – 1 Kingsford", secondary: "Full time" },
      ] },
    ],
  }),
  calendar: d({
    headline: { label: "Next event (sample)", value: "10:30 · Design review" },
    metrics: [
      { label: "Today", value: "4 events" },
      { label: "Free time", value: "3h 20m" },
      { label: "This week", value: "17" },
    ],
    series: [3, 5, 4, 6, 2, 0, 1, 4, 5, 4],
    sections: [
      { title: "Today (sample)", rows: [
        { primary: "Design review", secondary: "10:30 – 11:15" },
        { primary: "Lunch with Sam", secondary: "12:30 – 13:30" },
        { primary: "Deep work block", secondary: "14:00 – 16:00" },
        { primary: "Gym", secondary: "18:00 – 19:00" },
      ] },
    ],
  }),
  weather: d({
    headline: { label: "Now (sample location)", value: "14° · Overcast" },
    metrics: [
      { label: "High / Low", value: "17° / 9°" },
      { label: "Rain chance", value: "40%" },
      { label: "Wind", value: "12 km/h" },
    ],
    series: [9, 10, 11, 13, 14, 16, 17, 16, 14, 12],
    sections: [
      { title: "Forecast (sample)", rows: [
        { primary: "Tomorrow", secondary: "Light rain", value: "15° / 8°" },
        { primary: "Thursday", secondary: "Partly cloudy", value: "18° / 10°" },
        { primary: "Friday", secondary: "Sunny", value: "21° / 11°" },
      ] },
    ],
  }),
  ai: d({
    headline: { label: "Assistant", value: "Not connected" },
    metrics: [
      { label: "Provider", value: "None" },
      { label: "Voice", value: "Not built" },
      { label: "Boundary", value: "Typed" },
    ],
    series: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    sections: [
      { title: "Planned (not implemented)", rows: [
        { primary: "Provider-neutral interface", secondary: "src/ai/types.ts — OpenAI and Anthropic adapters will plug in here" },
        { primary: "Commands through one layer", secondary: "Model output is validated and dispatched like any other input" },
        { primary: "Camera stays user-activated", secondary: "AI may not start tracking or open the camera" },
      ] },
    ],
  }),
  news: d({
    headline: { label: "Top story (sample)", value: "Fusion pilot plant passes milestone" },
    metrics: [
      { label: "Unread", value: "12" },
      { label: "Sources", value: "6" },
      { label: "Saved", value: "3" },
    ],
    series: [4, 6, 5, 9, 7, 8, 12, 10, 11, 12],
    sections: [
      { title: "Headlines (sample, invented)", rows: [
        { primary: "Fusion pilot plant passes milestone", secondary: "Science · 2h" },
        { primary: "City opens new light-rail line", secondary: "Local · 5h" },
        { primary: "Open-source GPU drivers reach 1.0", secondary: "Technology · 7h" },
      ] },
    ],
  }),
  music: d({
    headline: { label: "Now playing (sample)", value: "Low Orbit — Halcyon Drift" },
    metrics: [
      { label: "Listening · today", value: "2h 10m" },
      { label: "Top genre", value: "Ambient" },
      { label: "Queue", value: "14 tracks" },
    ],
    series: [20, 45, 30, 60, 75, 40, 90, 110, 80, 130],
    sections: [
      { title: "Recently played (sample, invented)", rows: [
        { primary: "Low Orbit", secondary: "Halcyon Drift", value: "4:12" },
        { primary: "Glass Hours", secondary: "Meridian", value: "5:03" },
        { primary: "Signal Fade", secondary: "North Array", value: "3:47" },
      ] },
    ],
  }),
  system: d({
    headline: { label: "Status", value: "Nominal (sample)" },
    metrics: [
      { label: "CPU", value: "18%" },
      { label: "Memory", value: "41%" },
      { label: "Storage", value: "62%" },
    ],
    series: [12, 18, 15, 22, 19, 17, 25, 21, 16, 18],
    sections: [
      { title: "Diagnostics (sample values)", rows: [
        { primary: "Renderer and quality tier", secondary: "Live values are shown in the HUD, not here" },
        { primary: "Hardware telemetry", secondary: "Not connected in this milestone" },
      ] },
    ],
  }),
};
