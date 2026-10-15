import { describe, expect, it } from "vitest";
import { parseSave } from "./storage";

const NOW = new Date(2026, 9, 13, 9, 0).getTime();

describe("parseSave", () => {
  it("loads a v1 save as a fresh run led by its first hero", () => {
    const v1 = {
      durations: { focus: 30, short: 5, long: 15 },
      timer: { phase: "short", endsAt: null, remaining: 120_000, streak: 2 },
      stats: { day: "2026-10-13", quests: 3, foes: 150, totalFoes: 400 },
      party: [
        { name: "Mira", cls: "mage" },
        { name: "Bram", cls: "knight" },
      ],
    };
    const g = parseSave(v1, NOW);
    expect(g.durations.focus).toBe(30);
    expect(g.timer.phase).toBe("short");
    expect(g.stats).toMatchObject({ quests: 3, foes: 150, totalFoes: 400 });
    expect(g.run.heroes).toEqual([
      { name: "Mira", cls: "mage", weapon: 0, armor: 0, xp: 0, skills: [] },
    ]);
    expect(g.run.gold).toBe(0);
    expect(g.legacy).toEqual({ renown: 0, owned: [], retirements: 0 });
  });

  it("round-trips a current save and clamps bad values", () => {
    const g = parseSave(
      {
        run: {
          gold: 12.5,
          runGold: 300,
          heroes: [{ name: "Ada", cls: "knight", weapon: 9, armor: -1 }],
          paidFoes: 4,
          fightMs: 1,
        },
        legacy: { renown: 2, owned: ["fortune-1", 5], retirements: 1 },
      },
      NOW,
    );
    expect(g.run.heroes[0]).toMatchObject({ weapon: 3, armor: 0 });
    expect(g.run.gold).toBe(12.5);
    expect(g.run.fightMs).toBe(1_500);
    expect(g.run.heroes[0]?.xp).toBe(0);
    expect(g.legacy.owned).toEqual(["fortune-1"]);
  });

  it("falls back to defaults for garbage", () => {
    expect(parseSave("nope", NOW).run.heroes).toHaveLength(1);
  });
});
