/**
 * Sports — live scores, fixtures and standings from ESPN's public site API.
 * Leagues come from NEXUS_SPORTS (comma-separated ESPN paths).
 */
import { emptyPayload, type ModulePayload } from "@/core/payload";
import type { Game, GameState, GameTeam, LeagueBoard, SportsDetail, StandingRow } from "@/modules/types";
import { errorMessage, formatUntil, getJSON } from "./http";

const SOURCE = "ESPN site API";
const DEFAULT_LEAGUES = "soccer/eng.1,basketball/nba,football/nfl";

/* ─────────────────────────── ESPN shapes ─────────────────────────── */

interface EspnCompetitor {
  homeAway: "home" | "away";
  score?: string;
  winner?: boolean;
  team: { displayName?: string; shortDisplayName?: string; abbreviation?: string; logo?: string };
}
interface EspnEvent {
  id: string;
  name: string;
  shortName?: string;
  date: string;
  status: { type: { state: GameState; shortDetail?: string; detail?: string } };
  competitions: {
    competitors: EspnCompetitor[];
    venue?: { fullName?: string };
    broadcasts?: { names?: string[] }[];
  }[];
  links?: { href: string; rel?: string[] }[];
}
interface EspnScoreboard {
  leagues?: { name?: string; abbreviation?: string }[];
  events?: EspnEvent[];
}
interface EspnStat { name?: string; type?: string; abbreviation?: string; value?: number; displayValue?: string }
interface EspnEntry { team: { displayName?: string; abbreviation?: string; logos?: { href: string }[] }; stats?: EspnStat[] }
interface EspnStandingsNode {
  name?: string;
  abbreviation?: string;
  standings?: { entries?: EspnEntry[] };
  children?: EspnStandingsNode[];
}

/* ─────────────────────────── parsing ─────────────────────────── */

function team(c: EspnCompetitor | undefined, homeAway: "home" | "away"): GameTeam {
  return {
    name: c?.team.shortDisplayName ?? c?.team.displayName ?? "TBD",
    abbreviation: c?.team.abbreviation ?? "TBD",
    logo: c?.team.logo,
    score: c?.score,
    winner: c?.winner,
    homeAway,
  };
}

function toGame(e: EspnEvent, league: string): Game {
  const comp = e.competitions?.[0];
  const home = comp?.competitors.find((c) => c.homeAway === "home");
  const away = comp?.competitors.find((c) => c.homeAway === "away");
  return {
    id: e.id,
    league,
    name: e.shortName ?? e.name,
    date: e.date,
    state: e.status?.type?.state ?? "pre",
    status: e.status?.type?.shortDetail ?? e.status?.type?.detail ?? "",
    home: team(home, "home"),
    away: team(away, "away"),
    venue: comp?.venue?.fullName,
    broadcast: comp?.broadcasts?.flatMap((b) => b.names ?? [])[0],
    url: e.links?.find((l) => l.rel?.includes("summary") || l.rel?.includes("desktop"))?.href,
  };
}

const stat = (stats: EspnStat[] | undefined, ...names: string[]) =>
  stats?.find((s) => names.includes(s.name ?? "") || names.includes(s.type ?? "") || names.includes(s.abbreviation ?? ""));

function rowsOf(entries: EspnEntry[], sport: string): StandingRow[] {
  const rows = entries.map((e, i): StandingRow => {
    const s = e.stats;
    const rank = stat(s, "rank", "playoffSeed")?.value;
    const row: StandingRow = {
      rank: rank && rank > 0 ? rank : i + 1,
      team: e.team.displayName ?? "—",
      abbreviation: e.team.abbreviation ?? "",
      logo: e.team.logos?.[0]?.href,
      played: stat(s, "gamesPlayed")?.value,
      wins: stat(s, "wins")?.value,
      losses: stat(s, "losses")?.value,
      draws: stat(s, "ties", "draws")?.value,
      points: stat(s, "points")?.value,
    };
    if (sport === "soccer") {
      const gd = stat(s, "pointDifferential", "goalDifference");
      if (gd) { row.extra = gd.displayValue ?? String(gd.value); row.extraLabel = "GD"; }
    } else {
      const wp = stat(s, "winPercent");
      if (wp) { row.extra = wp.displayValue ?? wp.value?.toFixed(3); row.extraLabel = "PCT"; }
    }
    return row;
  });
  return rows.sort((a, b) => a.rank - b.rank).slice(0, 6);
}

/** Flatten ESPN's standings tree into up to two groups (e.g. NBA East/West). */
function standingsGroups(root: EspnStandingsNode, sport: string): { group: string; rows: StandingRow[] }[] {
  const groups: { group: string; rows: StandingRow[] }[] = [];
  const walk = (n: EspnStandingsNode) => {
    if (n.standings?.entries?.length) groups.push({ group: n.name ?? n.abbreviation ?? "Table", rows: rowsOf(n.standings.entries, sport) });
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
  return groups.slice(0, 2);
}

function ymd(d: Date) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function fetchLeague(leaguePath: string): Promise<LeagueBoard> {
  const sport = leaguePath.split("/")[0];
  const base = `https://site.api.espn.com/apis/site/v2/sports/${leaguePath}/scoreboard`;
  const board: LeagueBoard = { path: leaguePath, name: leaguePath, abbreviation: leaguePath.split("/")[1]?.toUpperCase() ?? leaguePath, games: [], standings: [] };

  const [sbRes, stRes] = await Promise.allSettled([
    getJSON<EspnScoreboard>(base, { timeoutMs: 7000, revalidate: 20 }),
    getJSON<EspnStandingsNode>(`https://site.api.espn.com/apis/v2/sports/${leaguePath}/standings`, { timeoutMs: 7000, revalidate: 600 }),
  ]);

  if (sbRes.status === "fulfilled") {
    const sb = sbRes.value;
    board.name = sb.leagues?.[0]?.name ?? board.name;
    board.abbreviation = sb.leagues?.[0]?.abbreviation ?? board.abbreviation;
    board.games = (sb.events ?? []).map((e) => toGame(e, board.abbreviation));
    // Nothing live or upcoming on the default board (off-day): look a week ahead.
    if (!board.games.some((g) => g.state !== "post")) {
      const now = new Date();
      const ahead = new Date(now.getTime() + 7 * 86_400_000);
      try {
        const next = await getJSON<EspnScoreboard>(`${base}?dates=${ymd(now)}-${ymd(ahead)}`, { timeoutMs: 7000, revalidate: 300 });
        const known = new Set(board.games.map((g) => g.id));
        board.games.push(...(next.events ?? []).filter((e) => !known.has(e.id)).map((e) => toGame(e, board.abbreviation)));
      } catch {
        /* fixtures look-ahead is best-effort */
      }
    }
    board.games.sort((a, b) => {
      const order = { in: 0, pre: 1, post: 2 } as const;
      return order[a.state] - order[b.state] || (a.state === "post" ? +new Date(b.date) - +new Date(a.date) : +new Date(a.date) - +new Date(b.date));
    });
  } else {
    board.error = errorMessage(sbRes.reason);
  }

  if (stRes.status === "fulfilled") {
    board.standings = standingsGroups(stRes.value, sport);
    if (!board.standings.length) board.standingsError = "No standings published for this league right now (off-season or cup format).";
  } else {
    board.standingsError = errorMessage(stRes.reason);
  }
  return board;
}

export async function fetchSports(_req: Request): Promise<ModulePayload<SportsDetail>> {
  const leagues = (process.env.NEXUS_SPORTS?.trim() || DEFAULT_LEAGUES)
    .split(",")
    .map((s) => s.trim().replace(/^\/+|\/+$/g, ""))
    .filter((s) => /^[a-z-]+\/[a-z0-9.\-_]+$/i.test(s));

  if (leagues.length === 0) {
    return emptyPayload(
      "sports",
      "unconfigured",
      SOURCE,
      "NEXUS_SPORTS has no valid ESPN league paths. Use a comma list like soccer/eng.1,basketball/nba,football/nfl in .env.local.",
    ) as ModulePayload<SportsDetail>;
  }

  const boards = await Promise.all(leagues.map(fetchLeague));
  if (boards.every((b) => b.error)) {
    return emptyPayload(
      "sports",
      "error",
      SOURCE,
      `ESPN didn't answer (${boards[0].error}). Check site.api.espn.com is reachable and the paths in NEXUS_SPORTS are valid (e.g. soccer/eng.1).`,
    ) as ModulePayload<SportsDetail>;
  }

  const all = boards.flatMap((b) => b.games);
  const live = all.filter((g) => g.state === "in");
  const now = Date.now();
  const nextFixture = all
    .filter((g) => g.state === "pre" && +new Date(g.date) >= now - 5 * 60_000)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))[0];
  const finals = all.filter((g) => g.state === "post");

  const headline = live.length
    ? { label: "Live now", value: `${live.length} ${live.length === 1 ? "game" : "games"}` }
    : nextFixture
      ? { label: `Next · ${nextFixture.league}`, value: `${nextFixture.away.abbreviation}–${nextFixture.home.abbreviation} ${formatUntil(+new Date(nextFixture.date) - now)}` }
      : { label: "Fixtures", value: "None this week" };

  const liveText = live
    .slice(0, 3)
    .map((g) => `${g.away.abbreviation} ${g.away.score ?? 0}–${g.home.score ?? 0} ${g.home.abbreviation} (${g.status})`)
    .join(", ");
  const summary = live.length
    ? `${live.length} live: ${liveText}.`
    : nextFixture
      ? `No games live. Next up: ${nextFixture.name} (${nextFixture.league}) ${formatUntil(+new Date(nextFixture.date) - now)}.`
      : "No live games or fixtures in the next week across your leagues.";

  return {
    id: "sports",
    status: "live",
    fetchedAt: now,
    source: SOURCE,
    headline,
    metrics: [
      { label: "Live", value: String(live.length) },
      { label: "Upcoming", value: String(all.filter((g) => g.state === "pre").length) },
      { label: "Finals", value: String(finals.length) },
      ...boards.map((b) => ({ label: b.abbreviation, value: b.error ? "offline" : `${b.games.length} games`, warn: !!b.error })),
    ].slice(0, 6),
    summary,
    detail: { leagues: boards, liveCount: live.length, nextFixture },
  };
}
