import type { Member } from "./scene";
import { HERO_CLASSES, type HeroClass } from "./sprites";
import {
  DEFAULT_DURATIONS,
  type Durations,
  freshTimer,
  type Phase,
  type TimerState,
} from "./timer";

export interface Stats {
  /** Local date (YYYY-MM-DD) the daily counts belong to. */
  day: string;
  quests: number;
  foes: number;
  totalFoes: number;
}

export interface Saved {
  durations: Durations;
  timer: TimerState;
  stats: Stats;
  party: Member[];
}

const KEY = "epicurus.pomodoro-quest.v1";

export const DEFAULT_PARTY: Member[] = [
  { name: "Ada", cls: "knight" },
  { name: "Bram", cls: "mage" },
  { name: "Cass", cls: "archer" },
  { name: "Dot", cls: "cleric" },
];

export function today(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function defaults(now: number): Saved {
  return {
    durations: DEFAULT_DURATIONS,
    timer: freshTimer("focus", DEFAULT_DURATIONS, 0),
    stats: { day: today(now), quests: 0, foes: 0, totalFoes: 0 },
    party: DEFAULT_PARTY.slice(0, 3),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
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

function parseParty(v: unknown): Member[] {
  if (!Array.isArray(v)) return DEFAULT_PARTY.slice(0, 3);
  const party = v.slice(0, 4).flatMap((m: unknown, i): Member[] => {
    if (!isRecord(m)) return [];
    const cls = HERO_CLASSES.find((c): c is HeroClass => c === m["cls"]) ?? "knight";
    const name =
      typeof m["name"] === "string" ? m["name"].slice(0, 16) : (DEFAULT_PARTY[i]?.name ?? "");
    return [{ name, cls }];
  });
  return party.length ? party : DEFAULT_PARTY.slice(0, 3);
}

export function load(now: number): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults(now);
    const v: unknown = JSON.parse(raw);
    if (!isRecord(v)) return defaults(now);
    const durations = parseDurations(v["durations"]);
    return {
      durations,
      timer: parseTimer(v["timer"], durations),
      stats: parseStats(v["stats"], now),
      party: parseParty(v["party"]),
    };
  } catch {
    return defaults(now);
  }
}

export function save(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage can be full or blocked; the toy still works for this visit.
  }
}
