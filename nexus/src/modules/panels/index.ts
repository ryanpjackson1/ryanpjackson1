/**
 * Expanded detail panels, one per module. Each renders inside a glass
 * container supplied by the caller (no outer frame or close button here).
 */
import type { ComponentType } from "react";
import type { ModuleId } from "@/core/modules";
import type { ModulePayload } from "@/core/payload";
import AiPanel from "./AiPanel";
import CalendarPanel from "./CalendarPanel";
import InstagramPanel from "./InstagramPanel";
import MusicPanel from "./MusicPanel";
import NewsPanel from "./NewsPanel";
import ProjectsPanel from "./ProjectsPanel";
import SportsPanel from "./SportsPanel";
import StocksPanel from "./StocksPanel";
import SystemPanel from "./SystemPanel";
import WeatherPanel from "./WeatherPanel";

export type PanelProps = { payload: ModulePayload };

export const PANELS: Record<ModuleId, ComponentType<PanelProps>> = {
  instagram: InstagramPanel,
  stocks: StocksPanel,
  projects: ProjectsPanel,
  sports: SportsPanel,
  calendar: CalendarPanel,
  weather: WeatherPanel,
  ai: AiPanel,
  news: NewsPanel,
  music: MusicPanel,
  system: SystemPanel,
};

export {
  AiPanel,
  CalendarPanel,
  InstagramPanel,
  MusicPanel,
  NewsPanel,
  ProjectsPanel,
  SportsPanel,
  StocksPanel,
  SystemPanel,
  WeatherPanel,
};
