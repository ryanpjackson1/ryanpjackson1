/**
 * Projects — GitHub repositories (most recently pushed) merged with an
 * optional local manifest that carries the things GitHub doesn't know about.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { emptyPayload, type ModulePayload } from "@/core/payload";
import type { Project, ProjectPrompt, ProjectsDetail } from "@/modules/types";
import { errorMessage, getJSON, UpstreamError } from "./http";

const SOURCE = "GitHub REST API";
const ACTIVE_MS = 30 * 86_400_000;

/**
 * Schema of `nexus.projects.json` (project root, next to package.json).
 * Keys are repository names (case-insensitive match against GitHub); keys
 * that match no repository become local-only projects.
 *
 * ```json
 * {
 *   "my-repo": {
 *     "description": "Overrides the GitHub description when set",
 *     "videos": ["/media/my-repo/demo.mp4", "https://…/walkthrough.mp4"],
 *     "images": ["/media/my-repo/hero.png"],
 *     "prompts": [
 *       { "at": "2026-09-14T10:02:00Z", "text": "Build the onboarding flow…" }
 *     ]
 *   }
 * }
 * ```
 * Media paths are used verbatim as `src` — put local files under /public.
 */
export interface ProjectManifestEntry {
  videos?: string[];
  images?: string[];
  description?: string;
  prompts?: ProjectPrompt[];
}
export type ProjectManifest = Record<string, ProjectManifestEntry>;

interface GhRepo {
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  topics?: string[];
  fork: boolean;
  archived: boolean;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : []);

/** Validate a manifest object leniently: bad fields are dropped, not fatal. */
export function normaliseManifest(raw: unknown): ProjectManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("top level must be an object keyed by repository name");
  const out: ProjectManifest = {};
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const e = v as Record<string, unknown>;
    out[name.toLowerCase()] = {
      videos: strings(e.videos),
      images: strings(e.images),
      description: typeof e.description === "string" ? e.description : undefined,
      prompts: Array.isArray(e.prompts)
        ? e.prompts
            .filter((p): p is { at: string; text: string } => !!p && typeof p === "object" && typeof (p as ProjectPrompt).text === "string")
            .map((p) => ({ at: typeof p.at === "string" ? p.at : "", text: p.text }))
            .sort((a, b) => b.at.localeCompare(a.at))
        : [],
    };
  }
  return out;
}

async function readManifest(): Promise<{ manifest: ProjectManifest; state: ProjectsDetail["manifest"]; error?: string }> {
  const file = path.join(process.cwd(), "nexus.projects.json");
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return { manifest: {}, state: "missing" };
  }
  try {
    return { manifest: normaliseManifest(JSON.parse(text)), state: "loaded" };
  } catch (e) {
    return { manifest: {}, state: "invalid", error: `nexus.projects.json: ${errorMessage(e)}` };
  }
}

function relDays(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`;
}

export async function fetchProjects(_req: Request): Promise<ModulePayload<ProjectsDetail>> {
  const user = process.env.NEXUS_GITHUB_USER?.trim();
  if (!user) {
    return emptyPayload(
      "projects",
      "unconfigured",
      SOURCE,
      "Set NEXUS_GITHUB_USER in .env.local to your GitHub username (optionally GITHUB_TOKEN for higher rate limits), and add nexus.projects.json at the project root for videos, images and prompt history.",
    ) as ModulePayload<ProjectsDetail>;
  }

  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "NEXUS",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.authorization = `Bearer ${token}`;

  const reposUrl = `https://api.github.com/users/${encodeURIComponent(user)}/repos?sort=pushed&per_page=12`;
  const loadRepos = (h: Record<string, string>) =>
    getJSON<GhRepo[]>(reposUrl, { headers: h, timeoutMs: 8000, revalidate: 300 }).then(
      (r) => ({ ok: true as const, repos: r }),
      (e: unknown) => ({ ok: false as const, error: e }),
    );
  const [{ manifest, state, error: manifestError }, firstTry] = await Promise.all([readManifest(), loadRepos(headers)]);
  let reposResult = firstTry;

  // A stale GITHUB_TOKEN shouldn't take the module down: public repos are readable anonymously.
  let tokenRejected = false;
  if (!reposResult.ok && token && reposResult.error instanceof UpstreamError && reposResult.error.status === 401) {
    const { authorization: _drop, ...anon } = headers;
    reposResult = await loadRepos(anon);
    tokenRejected = reposResult.ok;
  }

  if (!reposResult.ok) {
    const e = reposResult.error;
    let hint = `${errorMessage(e)}.`;
    if (e instanceof UpstreamError && e.status === 404) hint = `GitHub has no user "${user}". Fix NEXUS_GITHUB_USER in .env.local.`;
    else if (e instanceof UpstreamError && (e.status === 403 || e.status === 429)) hint = `GitHub rate limit hit (${e.message}). Set GITHUB_TOKEN in .env.local to a fine-grained token (public repo read access is enough).`;
    else if (e instanceof UpstreamError && e.status === 401) hint = "GITHUB_TOKEN was rejected. Create a new token at github.com/settings/tokens and update .env.local (or remove it to use anonymous access).";
    return emptyPayload("projects", "error", SOURCE, hint) as ModulePayload<ProjectsDetail>;
  }

  const now = Date.now();
  const seen = new Set<string>();
  const projects: Project[] = reposResult.repos.map((r) => {
    const m = manifest[r.name.toLowerCase()];
    seen.add(r.name.toLowerCase());
    return {
      name: r.name,
      description: m?.description ?? r.description ?? "",
      url: r.html_url,
      homepage: r.homepage || undefined,
      language: r.language ?? undefined,
      stars: r.stargazers_count,
      pushedAt: r.pushed_at,
      topics: r.topics ?? [],
      fork: r.fork,
      archived: r.archived,
      media: { videos: m?.videos ?? [], images: m?.images ?? [] },
      prompts: m?.prompts ?? [],
      active: now - new Date(r.pushed_at).getTime() < ACTIVE_MS,
    };
  });

  // Manifest-only entries (local or private work GitHub didn't return).
  for (const [key, m] of Object.entries(manifest)) {
    if (seen.has(key)) continue;
    const lastPrompt = m.prompts?.[0]?.at;
    projects.push({
      name: key,
      description: m.description ?? "",
      url: "",
      language: undefined,
      stars: 0,
      pushedAt: lastPrompt || undefined,
      topics: [],
      fork: false,
      archived: false,
      media: { videos: m.videos ?? [], images: m.images ?? [] },
      prompts: m.prompts ?? [],
      active: !!lastPrompt && now - new Date(lastPrompt).getTime() < ACTIVE_MS,
    });
  }

  const active = projects.filter((p) => p.active);
  const stars = projects.reduce((s, p) => s + p.stars, 0);
  const langs = new Map<string, number>();
  for (const p of projects) if (p.language) langs.set(p.language, (langs.get(p.language) ?? 0) + 1);
  const topLang = [...langs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const latest = projects.find((p) => p.pushedAt);

  const summary = projects.length
    ? `${active.length} of ${projects.length} projects pushed in the last 30 days${latest?.pushedAt ? `; most recent is ${latest.name} (${relDays(latest.pushedAt)})` : ""}.`
    : `GitHub user ${user} has no public repositories yet.`;

  // Activity series: pushes per week for the last 8 weeks (oldest → newest).
  const series = Array.from({ length: 8 }, (_, w) => {
    const hi = now - (7 - w) * 7 * 86_400_000;
    const lo = hi - 7 * 86_400_000;
    return projects.filter((p) => p.pushedAt && +new Date(p.pushedAt) > lo && +new Date(p.pushedAt) <= hi).length;
  });

  return {
    id: "projects",
    status: "live",
    fetchedAt: now,
    source: `${SOURCE}${state === "loaded" ? " + nexus.projects.json" : ""}`,
    headline: { label: "Active projects", value: String(active.length) },
    metrics: [
      { label: "Repositories", value: String(projects.length) },
      { label: "Stars", value: stars.toLocaleString("en-US") },
      { label: "Top language", value: topLang ?? "—" },
      { label: "Last push", value: latest?.pushedAt ? `${latest.name} · ${relDays(latest.pushedAt)}` : "—" },
      { label: "Manifest", value: state === "loaded" ? "loaded" : state === "missing" ? "none" : "invalid", warn: state === "invalid" },
      ...(tokenRejected ? [{ label: "GitHub token", value: "rejected", warn: true }] : []),
    ],
    series,
    summary,
    hint:
      state === "invalid"
        ? `${manifestError}. Fix the JSON at the project root (see the schema in src/modules/server/projects.ts).`
        : tokenRejected
          ? "GITHUB_TOKEN was rejected, so NEXUS fell back to anonymous access (60 requests/hour). Create a new token at github.com/settings/tokens and update .env.local."
          : undefined,
    detail: {
      user,
      profileUrl: `https://github.com/${encodeURIComponent(user)}`,
      projects,
      manifest: state,
      manifestError,
    },
  };
}
