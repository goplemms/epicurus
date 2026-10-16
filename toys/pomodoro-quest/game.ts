import {
  AREAS,
  areaFor,
  buyNode,
  canRetire,
  FINISH_BONUS,
  FINISH_XP,
  FOE_XP,
  foesBeaten,
  gearCost,
  grantXp,
  type Hero,
  type Legacy,
  learnSkill,
  MAX_PARTY,
  nthFoeSkills,
  partyBonuses,
  partyFightMs,
  perks,
  power,
  recruitCost,
  recruitXp,
  renownFor,
  respecCost,
  rollLoot,
  type Slot,
  skillNode,
  startingParty,
  sumSkill,
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
  /** The latest thing worth telling the player; the id tells repeats apart. */
  event: { text: string; id: number } | null;
}

function note(s: State, text: string): State["event"] {
  return { text, id: (s.event?.id ?? 0) + 1 };
}

export type Action =
  | { type: "tick"; now: number }
  | { type: "toggle"; now: number }
  | { type: "skip" }
  | { type: "restart" }
  | { type: "durations"; durations: Durations }
  | { type: "rename"; hero: number; name: string }
  | { type: "buyGear"; hero: number; slot: Slot }
  | { type: "learnSkill"; hero: number; id: string }
  | { type: "respec"; hero: number }
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
  return { gold: 0, runGold: 0, heroes, paidFoes: 0, fightMs: partyFightMs(heroes) };
}

function earn(s: State, gold: number): State {
  if (gold <= 0) return s;
  const mult = perks(s.legacy.owned).goldMult + partyBonuses(s.run.heroes).goldPct / 100;
  const g = gold * mult;
  return { ...s, run: { ...s.run, gold: s.run.gold + g, runGold: s.run.runGold + g } };
}

/** XP for the whole party; a level-up is news and rings the chime. */
function learn(s: State, xp: number): { state: State; text: string | null } {
  const { heroes, text } = grantXp(s.run.heroes, xp, s.legacy.owned);
  const state = { ...s, run: { ...s.run, heroes } };
  return { state, text };
}

/** Pays for every foe beaten so far this focus session that hasn't been paid for yet. */
function payFoes(s: State, now: number): State {
  if (s.timer.phase !== "focus" || isUntouched(s.timer, s.durations)) return s;
  const beaten = foesBeaten(elapsedAt(s.timer, s.durations, now), s.run.fightMs);
  const owed = beaten - s.run.paidFoes;
  if (owed <= 0) return s;
  const area = AREAS[areaFor(power(s.run.heroes))] ?? AREAS[0];
  // Cleave and Big game: every nth foe of the session counts again.
  let extraGold = 0;
  let extraXp = 0;
  for (const e of nthFoeSkills(s.run.heroes)) {
    const hits = Math.floor(beaten / e.value) - Math.floor(s.run.paidFoes / e.value);
    if (e.gold) extraGold += hits;
    if (e.xp) extraXp += hits;
  }
  const gold = (owed + extraGold) * area.goldPerFoe;
  const { state: learned, text } = learn(earn(s, gold), (owed + extraXp) * FOE_XP);
  // Bounty and Poacher: every nth foe of the session drops loot for sure.
  let heroes = learned.run.heroes;
  const found: string[] = [];
  for (const n of nthFoeLootSkills(s.run.heroes)) {
    for (let k = Math.floor(s.run.paidFoes / n) + 1; k <= Math.floor(beaten / n); k++) {
      const loot = rollLoot(heroes, (s.timer.endsAt ?? 0) + k * n * 104_729, 1);
      if (loot) {
        heroes = loot.heroes;
        found.push(loot.text);
      }
    }
  }
  const paid: State = {
    ...learned,
    run: { ...learned.run, heroes, paidFoes: beaten },
    stats: { ...s.stats, foes: s.stats.foes + owed, totalFoes: s.stats.totalFoes + owed },
  };
  const news = [...found, text].filter(Boolean).join(" ");
  return news ? { ...paid, chimes: paid.chimes + 1, event: note(s, news) } : paid;
}

/** The finish bonus, raised by Golden touch. */
function finishGold(heroes: readonly Hero[]): number {
  return FINISH_BONUS + sumSkill(heroes, "finishGold");
}

/** Finish XP, raised by Miracle. */
function finishXp(heroes: readonly Hero[]): number {
  return FINISH_XP + sumSkill(heroes, "finishXp");
}

/** The nth of each Bounty or Poacher the party has. */
function nthFoeLootSkills(heroes: readonly Hero[]): number[] {
  return heroes.flatMap((h) =>
    h.skills.flatMap((id) => {
      const e = skillNode(id)?.effect;
      return e?.kind === "nthFoeLoot" ? [e.value] : [];
    }),
  );
}

function finishPhase(s: State): State {
  const t = s.timer;
  let next: State = { ...s, timer: advance(t, s.durations, true), chimes: s.chimes + 1 };
  if (t.phase !== "focus") {
    // Sanctuary: a rest taken in full is worth some XP.
    const rested = learn(next, sumSkill(s.run.heroes, "restXp"));
    return rested.text ? { ...rested.state, event: note(s, rested.text) } : rested.state;
  }
  const learned = learn(earn(next, finishGold(next.run.heroes)), finishXp(next.run.heroes));
  next = learned.state;
  next = {
    ...next,
    stats: { ...next.stats, quests: next.stats.quests + 1 },
    run: { ...next.run, paidFoes: 0 },
  };
  const chance = perks(next.legacy.owned).lootChance + partyBonuses(next.run.heroes).lootPts / 100;
  // Treasure hunter adds rolls with their own seeds.
  const rolls = 1 + sumSkill(next.run.heroes, "extraLootRoll");
  const found: string[] = [];
  let heroes = next.run.heroes;
  for (let i = 0; i < rolls; i++) {
    const loot = rollLoot(heroes, (t.endsAt ?? 0) + i * 7_919, chance);
    if (loot) {
      heroes = loot.heroes;
      found.push(loot.text);
    }
  }
  const news = [...(found.length ? found : ["Quest complete."]), learned.text]
    .filter(Boolean)
    .join(" ");
  return { ...next, run: { ...next.run, heroes }, event: note(s, news) };
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
      const run = fresh ? { ...s.run, paidFoes: 0, fightMs: partyFightMs(s.run.heroes) } : s.run;
      return { ...s, run, timer: start(s.timer, a.now) };
    }
    case "skip": {
      // Foes already beaten were paid as they fell, so an abandoned session keeps them.
      let next = s;
      const pct = sumSkill(s.run.heroes, "abandonFinishPct") / 100;
      if (pct > 0 && s.timer.phase === "focus" && !isUntouched(s.timer, s.durations)) {
        // Grace: quitting early still pays part of the finish bonus.
        const learned = learn(
          earn(s, finishGold(s.run.heroes) * pct),
          finishXp(s.run.heroes) * pct,
        );
        next = learned.text ? { ...learned.state, event: note(s, learned.text) } : learned.state;
      }
      return {
        ...next,
        timer: advance(s.timer, s.durations, false),
        run: { ...next.run, paidFoes: 0 },
      };
    }
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
      const cost = hero ? gearCost(hero, a.slot, s.run.heroes) : null;
      if (!hero || cost === null || s.run.gold < cost) return s;
      const heroes = s.run.heroes.map((h, i) =>
        i === a.hero ? { ...h, [a.slot]: h[a.slot] + 1 } : h,
      );
      return { ...s, run: { ...s.run, gold: s.run.gold - cost, heroes } };
    }
    case "learnSkill": {
      const hero = s.run.heroes[a.hero];
      if (!hero) return s;
      const learned = learnSkill(hero, a.id);
      if (learned === hero) return s;
      return {
        ...s,
        run: { ...s.run, heroes: s.run.heroes.map((h, i) => (i === a.hero ? learned : h)) },
      };
    }
    case "respec": {
      const hero = s.run.heroes[a.hero];
      if (!hero?.skills.length || isRunning(s.timer)) return s;
      const cost = respecCost(hero);
      if (s.run.gold < cost) return s;
      const heroes = s.run.heroes.map((h, i) => (i === a.hero ? { ...h, skills: [] } : h));
      return { ...s, run: { ...s.run, gold: s.run.gold - cost, heroes } };
    }
    case "recruit": {
      const cost = recruitCost(s.run.heroes, s.legacy.owned);
      if (cost === null || s.run.gold < cost || s.run.heroes.length >= MAX_PARTY) return s;
      const xp = recruitXp(s.run.heroes, s.legacy.owned);
      const hero: Hero = {
        name: a.name.slice(0, 16),
        cls: a.cls,
        weapon: 0,
        armor: 0,
        xp,
        skills: [],
      };
      return {
        ...s,
        run: { ...s.run, gold: s.run.gold - cost, heroes: [...s.run.heroes, hero] },
        event: note(s, `${hero.name || "A new hero"} joined the party.`),
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
        event: note(
          s,
          `The party retired with honor: +${gained} renown. ${leader.name || "Your leader"} sets out again.`,
        ),
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
