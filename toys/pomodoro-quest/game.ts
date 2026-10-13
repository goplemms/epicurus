import {
  AREAS,
  areaFor,
  buyNode,
  canRetire,
  FINISH_BONUS,
  fightMsFor,
  foesBeaten,
  gearCost,
  type Hero,
  type Legacy,
  MAX_PARTY,
  perks,
  power,
  recruitCost,
  renownFor,
  rollLoot,
  type Slot,
  startingParty,
} from "./economy";
import type { HeroClass } from "./sprites";
import {
  advance,
  type Durations,
  elapsedAt,
  freshTimer,
  isRunning,
  isUntouched,
  pause,
  phaseMs,
  start,
  type TimerState,
} from "./timer";

export interface Stats {
  /** Local date (YYYY-MM-DD) the daily counts belong to. */
  day: string;
  quests: number;
  foes: number;
  totalFoes: number;
}

/** Everything that resets when the party retires. */
export interface Run {
  /** Fractional while gold bonuses apply; shown rounded down. */
  gold: number;
  /** All gold earned this run, which sets the renown for retiring. */
  runGold: number;
  heroes: Hero[];
  /** Foes already paid for in the current focus session. */
  paidFoes: number;
  /** Fight length, fixed when the focus session starts so gear bought mid-session can't reshuffle the story. */
  fightMs: number;
}

/** What is saved. */
export interface Game {
  durations: Durations;
  timer: TimerState;
  stats: Stats;
  run: Run;
  legacy: Legacy;
}

export interface State extends Game {
  /** Bumped each time a phase runs out, so the chime plays once per finish. */
  chimes: number;
  /** The latest thing worth telling the player. */
  event: string | null;
}

export type Action =
  | { type: "tick"; now: number }
  | { type: "toggle"; now: number }
  | { type: "skip" }
  | { type: "restart" }
  | { type: "durations"; durations: Durations }
  | { type: "rename"; hero: number; name: string }
  | { type: "buyGear"; hero: number; slot: Slot }
  | { type: "recruit"; name: string; cls: HeroClass }
  | { type: "retire" }
  | { type: "buyNode"; id: string };

export function today(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function newRun(leader: { name: string; cls: HeroClass }, owned: readonly string[]): Run {
  const heroes = startingParty(leader, owned);
  return { gold: 0, runGold: 0, heroes, paidFoes: 0, fightMs: fightMsFor(power(heroes)) };
}

function earn(s: State, gold: number): State {
  if (gold <= 0) return s;
  const g = gold * perks(s.legacy.owned).goldMult;
  return { ...s, run: { ...s.run, gold: s.run.gold + g, runGold: s.run.runGold + g } };
}

/** Pays for every foe beaten so far this focus session that hasn't been paid for yet. */
function payFoes(s: State, now: number): State {
  if (s.timer.phase !== "focus" || isUntouched(s.timer, s.durations)) return s;
  const beaten = foesBeaten(elapsedAt(s.timer, s.durations, now), s.run.fightMs);
  const owed = beaten - s.run.paidFoes;
  if (owed <= 0) return s;
  const area = AREAS[areaFor(power(s.run.heroes))] ?? AREAS[0];
  const paid = earn(s, owed * area.goldPerFoe);
  return {
    ...paid,
    run: { ...paid.run, paidFoes: beaten },
    stats: { ...s.stats, foes: s.stats.foes + owed, totalFoes: s.stats.totalFoes + owed },
  };
}

function finishPhase(s: State): State {
  const t = s.timer;
  let next: State = { ...s, timer: advance(t, s.durations, true), chimes: s.chimes + 1 };
  if (t.phase !== "focus") return next;
  next = earn(next, FINISH_BONUS);
  next = {
    ...next,
    stats: { ...next.stats, quests: next.stats.quests + 1 },
    run: { ...next.run, paidFoes: 0 },
  };
  const loot = rollLoot(next.run.heroes, t.endsAt ?? 0, perks(next.legacy.owned).lootChance);
  return loot
    ? { ...next, run: { ...next.run, heroes: loot.heroes }, event: loot.text }
    : { ...next, event: "Quest complete." };
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "tick": {
      const day = today(a.now);
      if (s.stats.day !== day) s = { ...s, stats: { ...s.stats, day, quests: 0, foes: 0 } };
      s = payFoes(s, a.now);
      const t = s.timer;
      return t.endsAt !== null && a.now >= t.endsAt ? finishPhase(s) : s;
    }
    case "toggle": {
      if (isRunning(s.timer)) return { ...s, timer: pause(s.timer, a.now) };
      const fresh = s.timer.phase === "focus" && isUntouched(s.timer, s.durations);
      const run = fresh
        ? { ...s.run, paidFoes: 0, fightMs: fightMsFor(power(s.run.heroes)) }
        : s.run;
      return { ...s, run, timer: start(s.timer, a.now) };
    }
    case "skip":
      // Foes already beaten were paid as they fell, so an abandoned session keeps them.
      return { ...s, timer: advance(s.timer, s.durations, false), run: { ...s.run, paidFoes: 0 } };
    case "restart":
      return {
        ...s,
        timer: freshTimer(s.timer.phase, s.durations, s.timer.streak),
        run: { ...s.run, paidFoes: 0 },
      };
    case "durations": {
      const t = s.timer;
      const timer = isUntouched(t, s.durations)
        ? freshTimer(t.phase, a.durations, t.streak)
        : { ...t, remaining: Math.min(t.remaining, phaseMs(t.phase, a.durations)) };
      return { ...s, durations: a.durations, timer };
    }
    case "rename":
      return {
        ...s,
        run: {
          ...s.run,
          heroes: s.run.heroes.map((h, i) =>
            i === a.hero ? { ...h, name: a.name.slice(0, 16) } : h,
          ),
        },
      };
    case "buyGear": {
      const hero = s.run.heroes[a.hero];
      const cost = hero ? gearCost(hero, a.slot) : null;
      if (!hero || cost === null || s.run.gold < cost) return s;
      const heroes = s.run.heroes.map((h, i) =>
        i === a.hero ? { ...h, [a.slot]: h[a.slot] + 1 } : h,
      );
      return { ...s, run: { ...s.run, gold: s.run.gold - cost, heroes } };
    }
    case "recruit": {
      const cost = recruitCost(s.run.heroes, s.legacy.owned);
      if (cost === null || s.run.gold < cost || s.run.heroes.length >= MAX_PARTY) return s;
      const hero: Hero = { name: a.name.slice(0, 16), cls: a.cls, weapon: 0, armor: 0 };
      return {
        ...s,
        run: { ...s.run, gold: s.run.gold - cost, heroes: [...s.run.heroes, hero] },
        event: `${hero.name || "A new hero"} joined the party.`,
      };
    }
    case "retire": {
      const leader = s.run.heroes[0];
      if (!leader || !canRetire(s.run.heroes) || isRunning(s.timer)) return s;
      const gained = renownFor(s.run.runGold);
      const legacy = {
        ...s.legacy,
        renown: s.legacy.renown + gained,
        retirements: s.legacy.retirements + 1,
      };
      return {
        ...s,
        legacy,
        run: newRun(leader, legacy.owned),
        timer:
          s.timer.phase === "focus" ? freshTimer("focus", s.durations, s.timer.streak) : s.timer,
        event: `The party retired with honor: +${gained} renown. ${leader.name || "Your leader"} sets out again.`,
      };
    }
    case "buyNode": {
      const legacy = buyNode(s.legacy, a.id);
      if (legacy === s.legacy) return s;
      // Start-of-run rewards still apply to a run that hasn't earned anything yet.
      const leader = s.run.heroes[0];
      const run = s.run.runGold === 0 && leader ? newRun(leader, legacy.owned) : s.run;
      return { ...s, legacy, run };
    }
  }
}
