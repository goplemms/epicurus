import {
  DEFAULT_HEROES,
  type Hero,
  type Legacy,
  MAX_LEVEL,
  MAX_PARTY,
  MAX_TIER,
  MIN_FIGHT_MS,
  partyFightMs,
  xpForLevel,
} from "./economy";
import { type Game, newRun, type Run, type Stats, today } from "./game";
import { HERO_CLASSES, type HeroClass } from "./sprites";
import {
  DEFAULT_DURATIONS,
  type Durations,
  freshTimer,
  type Phase,
  type TimerState,
} from "./timer";

// The key keeps its v1 name; saves from v1 (a free party, no gold) load as a fresh run.
const KEY = "epicurus.pomodoro-quest.v1";

const LEADER = DEFAULT_HEROES[0] ?? { name: "Ada", cls: "knight" };

export function defaults(now: number): Game {
  return {
    durations: DEFAULT_DURATIONS,
    timer: freshTimer("focus", DEFAULT_DURATIONS, 0),
    stats: { day: today(now), quests: 0, foes: 0, totalFoes: 0 },
    run: newRun(LEADER, []),
    legacy: { renown: 0, owned: [], retirements: 0 },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function tier(v: unknown): number {
  return Math.round(num(v, 0, 0, MAX_TIER));
}

function parseDurations(v: unknown): Durations {
  if (!isRecord(v)) return DEFAULT_DURATIONS;
  return {
    focus: num(v["focus"], DEFAULT_DURATIONS.focus, 1, 120),
    short: num(v["short"], DEFAULT_DURATIONS.short, 1, 60),
    long: num(v["long"], DEFAULT_DURATIONS.long, 1, 60),
  };
}

function parseTimer(v: unknown, d: Durations): TimerState {
  if (!isRecord(v)) return freshTimer("focus", d, 0);
  const phase: Phase = v["phase"] === "short" || v["phase"] === "long" ? v["phase"] : "focus";
  const endsAt = v["endsAt"];
  return {
    phase,
    endsAt: typeof endsAt === "number" && Number.isFinite(endsAt) ? endsAt : null,
    remaining: num(v["remaining"], d[phase] * 60_000, 0, d[phase] * 60_000),
    streak: num(v["streak"], 0, 0, 99),
  };
}

function parseStats(v: unknown, now: number): Stats {
  const fresh = { day: today(now), quests: 0, foes: 0, totalFoes: 0 };
  if (!isRecord(v)) return fresh;
  const totalFoes = num(v["totalFoes"], 0);
  if (v["day"] !== fresh.day) return { ...fresh, totalFoes };
  return { day: fresh.day, quests: num(v["quests"], 0), foes: num(v["foes"], 0), totalFoes };
}

function parseHero(v: unknown, i: number): Hero | null {
  if (!isRecord(v)) return null;
  const cls = HERO_CLASSES.find((c): c is HeroClass => c === v["cls"]) ?? "knight";
  const name =
    typeof v["name"] === "string" ? v["name"].slice(0, 16) : (DEFAULT_HEROES[i]?.name ?? "");
  // Saves from before hero levels have no XP and load at level 1.
  const xp = num(v["xp"], 0, 0, xpForLevel(MAX_LEVEL));
  return { name, cls, weapon: tier(v["weapon"]), armor: tier(v["armor"]), xp };
}

function parseRun(v: unknown, v1Party: unknown, legacy: Legacy): Run {
  if (!isRecord(v)) {
    // A v1 save: keep its first hero as the leader of a fresh run.
    const leader = Array.isArray(v1Party) ? parseHero(v1Party[0], 0) : null;
    return newRun(leader ?? LEADER, legacy.owned);
  }
  const raw = Array.isArray(v["heroes"]) ? v["heroes"].slice(0, MAX_PARTY) : [];
  const heroes = raw.flatMap((h: unknown, i) => parseHero(h, i) ?? []);
  if (!heroes.length) return newRun(LEADER, legacy.owned);
  const fightMs = partyFightMs(heroes);
  return {
    gold: num(v["gold"], 0),
    runGold: num(v["runGold"], 0),
    heroes,
    paidFoes: Math.round(num(v["paidFoes"], 0)),
    fightMs: num(v["fightMs"], fightMs, MIN_FIGHT_MS, 8_000),
  };
}

function parseLegacy(v: unknown): Legacy {
  if (!isRecord(v)) return { renown: 0, owned: [], retirements: 0 };
  const owned = Array.isArray(v["owned"])
    ? v["owned"].filter((id): id is string => typeof id === "string")
    : [];
  return {
    renown: Math.round(num(v["renown"], 0)),
    owned,
    retirements: Math.round(num(v["retirements"], 0)),
  };
}

/** Reads a save of any version, falling back to defaults for anything missing or malformed. */
export function parseSave(v: unknown, now: number): Game {
  if (!isRecord(v)) return defaults(now);
  const durations = parseDurations(v["durations"]);
  const legacy = parseLegacy(v["legacy"]);
  return {
    durations,
    timer: parseTimer(v["timer"], durations),
    stats: parseStats(v["stats"], now),
    run: parseRun(v["run"], v["party"], legacy),
    legacy,
  };
}

export function load(now: number): Game {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseSave(JSON.parse(raw), now) : defaults(now);
  } catch {
    return defaults(now);
  }
}

export function save(g: Game): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    // Storage can be full or blocked; the toy still works for this visit.
  }
}
