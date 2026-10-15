import { describe, expect, it } from "vitest";
import { foesBeaten, levelFor, partyFightMs, xpForLevel } from "./economy";
import { type Action, reducer, type State } from "./game";
import { defaults } from "./storage";

const T0 = new Date(2026, 9, 13, 9, 0).getTime();
const MIN = 60_000;

function fresh(): State {
  return { ...defaults(T0), chimes: 0, event: null };
}

const FIGHT = partyFightMs(fresh().run.heroes);

function run(s: State, ...actions: Action[]): State {
  return actions.reduce(reducer, s);
}

describe("earning", () => {
  it("pays gold as foes fall and a bonus on finishing", () => {
    let s = run(fresh(), { type: "toggle", now: T0 });
    s = run(s, { type: "tick", now: T0 + 5 * MIN });
    expect(s.run.gold).toBe(foesBeaten(5 * MIN, FIGHT));
    expect(s.stats.foes).toBe(s.run.gold);

    s = run(s, { type: "tick", now: T0 + 25 * MIN });
    expect(s.timer.phase).toBe("short");
    expect(s.stats.quests).toBe(1);
    expect(s.run.runGold).toBe(foesBeaten(25 * MIN, FIGHT) + 10);
    expect(s.chimes).toBe(1);
  });

  it("keeps what an abandoned session earned, without the bonus", () => {
    let s = run(
      fresh(),
      { type: "toggle", now: T0 },
      { type: "tick", now: T0 + 10 * MIN },
      { type: "skip" },
    );
    const earned = foesBeaten(10 * MIN, FIGHT);
    expect(s.run.gold).toBe(earned);
    expect(s.stats.quests).toBe(0);
    // The next focus session starts counting from zero again.
    s = run(s, { type: "skip" }, { type: "toggle", now: T0 + 11 * MIN });
    s = run(s, { type: "tick", now: T0 + 11 * MIN + 1_000 });
    expect(s.run.gold).toBe(earned);
  });

  it("applies the Fortune bonus", () => {
    const base = fresh();
    const s = run(
      { ...base, legacy: { renown: 0, owned: ["fortune-1"], retirements: 1 } },
      { type: "toggle", now: T0 },
      { type: "tick", now: T0 + 10 * MIN },
    );
    expect(s.run.gold).toBeCloseTo(foesBeaten(10 * MIN, FIGHT) * 1.1);
  });
});

describe("hero levels", () => {
  it("pays XP as foes fall, plus a finish bonus, and announces level-ups", () => {
    let s = run(fresh(), { type: "toggle", now: T0 }, { type: "tick", now: T0 + 5 * MIN });
    expect(s.run.heroes[0]?.xp).toBe(foesBeaten(5 * MIN, FIGHT));
    s = run(s, { type: "tick", now: T0 + 25 * MIN });
    const xp = foesBeaten(25 * MIN, FIGHT) + 10;
    expect(s.run.heroes[0]?.xp).toBe(xp);
    expect(levelFor(xp)).toBe(2);
    expect(s.event?.text).toContain("Ada reached level 2!");
  });

  it("recruits join two levels below the party's best", () => {
    const base = fresh();
    const leader = {
      name: "Ada",
      cls: "knight" as const,
      weapon: 0,
      armor: 0,
      xp: xpForLevel(7),
      skills: [],
    };
    let s: State = { ...base, run: { ...base.run, gold: 100, heroes: [leader] } };
    s = run(s, { type: "recruit", name: "Bo", cls: "mage" });
    expect(levelFor(s.run.heroes[1]?.xp ?? 0)).toBe(5);
  });
});

describe("skill trees", () => {
  const withLeader = (skills: string[], xp = xpForLevel(10)): State => {
    const base = fresh();
    const leader = { name: "Ada", cls: "knight" as const, weapon: 0, armor: 0, xp, skills };
    return { ...base, run: { ...base.run, heroes: [leader], fightMs: partyFightMs([leader]) } };
  };

  it("learns a node with a free point and respecs for gold while paused", () => {
    let s = withLeader([], xpForLevel(2));
    s = run(s, { type: "learnSkill", hero: 0, id: "knight-guardian-1" });
    expect(s.run.heroes[0]?.skills).toEqual(["knight-guardian-1"]);
    expect(run(s, { type: "respec", hero: 0 })).toBe(s);
    s = { ...s, run: { ...s.run, gold: 25 } };
    s = run(s, { type: "respec", hero: 0 });
    expect(s.run.heroes[0]?.skills).toEqual([]);
    expect(s.run.gold).toBe(5);
  });

  it("Cleave counts every 5th foe twice, for gold and XP", () => {
    const cleave = [1, 2, 3, 4, 5].map((t) => `knight-berserker-${t}`);
    let s = withLeader(cleave);
    const fight = s.run.fightMs;
    s = run(s, { type: "toggle", now: T0 }, { type: "tick", now: T0 + 10 * MIN });
    const foes = foesBeaten(10 * MIN, fight);
    expect(s.run.gold).toBe(foes + Math.floor(foes / 5));
    expect(s.run.heroes[0]?.xp).toBeCloseTo(xpForLevel(10));
  });

  it("Grace pays half the finish bonus when a started session is skipped", () => {
    const base = fresh();
    const cleric = {
      name: "Dot",
      cls: "cleric" as const,
      weapon: 0,
      armor: 0,
      xp: xpForLevel(6),
      skills: [1, 2, 3, 4, 5].map((t) => `cleric-healer-${t}`),
    };
    let s: State = { ...base, run: { ...base.run, heroes: [cleric] } };
    s = run(s, { type: "toggle", now: T0 }, { type: "tick", now: T0 + 1_000 }, { type: "skip" });
    expect(s.run.gold).toBe(5);
    expect(run(s, { type: "skip" }).run.gold).toBe(5);
  });

  it("Sanctuary gives XP when a rest runs out", () => {
    const base = fresh();
    const cleric = {
      name: "Dot",
      cls: "cleric" as const,
      weapon: 0,
      armor: 0,
      xp: xpForLevel(6),
      skills: [1, 2, 3, 4, 5].map((t) => `cleric-templar-${t}`),
    };
    let s: State = { ...base, run: { ...base.run, heroes: [cleric] } };
    s = run(s, { type: "skip" });
    expect(s.timer.phase).toBe("short");
    s = run(s, { type: "toggle", now: T0 }, { type: "tick", now: T0 + 60 * MIN });
    expect(s.run.heroes[0]?.xp).toBeGreaterThan(xpForLevel(6));
  });
});

describe("spending", () => {
  it("buys gear and recruits only with enough gold", () => {
    let s = fresh();
    expect(run(s, { type: "buyGear", hero: 0, slot: "weapon" })).toBe(s);
    s = { ...s, run: { ...s.run, gold: 120 } };
    s = run(s, { type: "buyGear", hero: 0, slot: "weapon" });
    expect(s.run.heroes[0]?.weapon).toBe(1);
    expect(s.run.gold).toBe(90);
    s = run(s, { type: "recruit", name: "Bo", cls: "cleric" });
    expect(s.run.heroes).toHaveLength(2);
    expect(s.run.gold).toBe(10);
  });

  it("locks fight length at the start of a session", () => {
    let s = { ...fresh(), run: { ...fresh().run, gold: 1_000 } };
    s = run(s, { type: "toggle", now: T0 });
    const locked = s.run.fightMs;
    s = run(s, { type: "buyGear", hero: 0, slot: "armor" });
    expect(s.run.fightMs).toBe(locked);
  });
});

describe("retiring", () => {
  it("needs the second area, then trades the run for renown", () => {
    let s = fresh();
    expect(run(s, { type: "retire" })).toBe(s);
    s = {
      ...s,
      run: {
        ...s.run,
        runGold: 900,
        gold: 50,
        heroes: [
          {
            name: "Ada",
            cls: "knight",
            weapon: 3,
            armor: 3,
            xp: xpForLevel(6),
            skills: ["knight-guardian-1"],
          },
          { name: "Bo", cls: "cleric", weapon: 2, armor: 0, xp: 0, skills: [] },
        ],
      },
    };
    s = run(s, { type: "retire" });
    expect(s.legacy).toEqual({ renown: 3, owned: [], retirements: 1 });
    expect(s.run.gold).toBe(0);
    expect(s.run.heroes).toEqual([
      { name: "Ada", cls: "knight", weapon: 0, armor: 0, xp: 0, skills: [] },
    ]);
  });

  it("applies start-of-run rewards bought before the new run earns anything", () => {
    let s: State = { ...fresh(), legacy: { renown: 2, owned: [], retirements: 1 } };
    s = run(s, { type: "buyNode", id: "muster-1" }, { type: "buyNode", id: "heirloom-1" });
    expect(s.legacy.renown).toBe(0);
    expect(s.run.heroes).toHaveLength(2);
    expect(s.run.heroes[0]?.weapon).toBe(1);
  });
});
