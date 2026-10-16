import { describe, expect, it } from "vitest";
import {
  areaFor,
  buyNode,
  canBuyNode,
  canLearn,
  canRetire,
  fightMsFor,
  foesBeaten,
  gearCost,
  grantXp,
  type Hero,
  learnSkill,
  levelFor,
  partyBonuses,
  partyFightMs,
  perks,
  power,
  recruitCost,
  recruitXp,
  renownFor,
  respecCost,
  rollLoot,
  SKILLS,
  skillPoints,
  startingParty,
  TREE,
  validSkills,
  WALK_MS,
  xpForLevel,
} from "./economy";

const hero = (weapon = 0, armor = 0, xp = 0): Hero => ({
  name: "Ada",
  cls: "knight",
  weapon,
  armor,
  xp,
  skills: [],
});

describe("power and fights", () => {
  it("counts one per hero plus gear tiers", () => {
    expect(power([hero(), hero(2, 1)])).toBe(5);
  });

  it("shortens fights with power, down to 3 seconds", () => {
    expect(fightMsFor(1)).toBe(7_750);
    expect(fightMsFor(10)).toBe(5_500);
    expect(fightMsFor(40)).toBe(3_000);
  });

  it("counts a foe once its fight ends", () => {
    const fight = 6_000;
    expect(foesBeaten(WALK_MS + fight - 1, fight)).toBe(0);
    expect(foesBeaten(WALK_MS + fight, fight)).toBe(1);
    expect(foesBeaten(25 * 60_000, fightMsFor(1))).toBe(50);
  });

  it("opens the second area at power 10", () => {
    expect(areaFor(9)).toBe(0);
    expect(areaFor(10)).toBe(1);
    expect(canRetire([hero(3, 3), hero(1, 1)])).toBe(true);
    expect(canRetire([hero(3, 3)])).toBe(false);
  });
});

describe("prices", () => {
  it("prices gear by the next tier and stops at gold", () => {
    expect(gearCost(hero(0), "weapon")).toBe(30);
    expect(gearCost(hero(2), "weapon")).toBe(250);
    expect(gearCost(hero(3), "weapon")).toBeNull();
  });

  it("prices recruits by party size, with the Muster discount", () => {
    expect(recruitCost([hero()], [])).toBe(80);
    expect(recruitCost([hero(), hero(), hero()], [])).toBe(450);
    expect(recruitCost([hero(), hero(), hero(), hero()], [])).toBeNull();
    expect(recruitCost([hero()], ["muster-1", "muster-2"])).toBe(60);
  });

  it("pays renown by the square root of run gold", () => {
    expect(renownFor(99)).toBe(0);
    expect(renownFor(550)).toBe(2);
    expect(renownFor(2_500)).toBe(5);
  });
});

describe("renown tree", () => {
  const legacy = { renown: 3, owned: [] as string[], retirements: 1 };

  it("needs the previous tier and enough renown", () => {
    const tier2 = TREE.find((n) => n.id === "fortune-2");
    if (!tier2) throw new Error("missing node");
    expect(canBuyNode(legacy, tier2)).toBe(false);
    const after = buyNode(legacy, "fortune-1");
    expect(after.renown).toBe(2);
    expect(canBuyNode(after, tier2)).toBe(true);
    expect(buyNode(after, "fortune-1")).toBe(after);
  });

  it("adds up effects", () => {
    const p = perks(["fortune-1", "fortune-2", "fortune-3", "heirloom-1", "heirloom-2"]);
    expect(p.goldMult).toBeCloseTo(1.2);
    expect(p.lootChance).toBeCloseTo(0.4);
    expect(p.heirloom).toEqual({ weapon: 2, armor: 0 });
  });

  it("starts runs with Muster heroes and heirloom gear", () => {
    const party = startingParty({ name: "Zed", cls: "mage" }, ["muster-1", "heirloom-1"]);
    expect(party.map((h) => h.cls)).toEqual(["mage", "knight"]);
    expect(party[0]).toMatchObject({ name: "Zed", weapon: 1, armor: 0 });
    expect(startingParty({ name: "Zed", cls: "mage" }, [])).toHaveLength(1);
  });
});

describe("loot", () => {
  it("is repeatable for a seed and upgrades one open slot", () => {
    const party = [hero(), hero(3, 3)];
    const results = Array.from({ length: 200 }, (_, seed) => rollLoot(party, seed, 0.2));
    const drops = results.filter((r) => r !== null);
    expect(drops.length).toBeGreaterThan(20);
    expect(drops.length).toBeLessThan(70);
    for (const d of drops) {
      expect(power(d.heroes)).toBe(power(party) + 1);
      expect(d.heroes[1]).toEqual(party[1]);
    }
    expect(rollLoot(party, 7, 0.2)).toEqual(rollLoot(party, 7, 0.2));
  });
});

describe("hero levels", () => {
  it("follows the 60 x n curve up to level 10", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(60);
    expect(xpForLevel(4)).toBe(360);
    expect(xpForLevel(10)).toBe(2_700);
    expect(levelFor(59)).toBe(1);
    expect(levelFor(60)).toBe(2);
    expect(levelFor(99_999)).toBe(10);
  });

  it("adds power at levels 4, 7 and 10", () => {
    expect(power([hero(0, 0, xpForLevel(3))])).toBe(1);
    expect(power([hero(0, 0, xpForLevel(4))])).toBe(2);
    expect(power([hero(0, 0, xpForLevel(10))])).toBe(4);
  });

  it("stacks class perks by level", () => {
    const mage: Hero = { ...hero(0, 0, xpForLevel(5)), cls: "mage" };
    const archer: Hero = { ...hero(0, 0, xpForLevel(10)), cls: "archer" };
    expect(partyBonuses([mage, mage, archer])).toEqual({
      fightPct: 0,
      goldPct: 30,
      lootPts: 15,
      xpPct: 0,
    });
  });

  it("lets knights shorten fights, at most by half", () => {
    const knight = hero(0, 0, xpForLevel(10));
    expect(partyFightMs([knight])).toBe(Math.round(fightMsFor(power([knight])) * 0.8));
    expect(partyFightMs([knight, knight, knight, knight])).toBe(
      Math.round(fightMsFor(power([knight, knight, knight, knight])) * 0.5),
    );
  });

  it("shares XP, scaled by Blessing and Veterans, and announces level-ups", () => {
    const cleric: Hero = { ...hero(), name: "Dot", cls: "cleric" };
    const plain = grantXp([hero(), cleric], 50, []);
    expect(plain.heroes.map((h) => h.xp)).toEqual([51.5, 51.5]);
    expect(plain.text).toBeNull();
    const vet = grantXp([hero(), cleric], 50, ["veterans-1", "veterans-2"]);
    expect(vet.heroes[0]?.xp).toBeCloseTo(64);
    expect(vet.text).toBe("Ada reached level 2! Dot reached level 2!");
    expect(grantXp([hero(0, 0, 2_690)], 50, []).heroes[0]?.xp).toBe(2_700);
  });

  it("starts runs at the Veterans level and recruits two below the best", () => {
    const party = startingParty({ name: "Zed", cls: "mage" }, ["veterans-1"]);
    expect(levelFor(party[0]?.xp ?? 0)).toBe(3);
    expect(levelFor(recruitXp([hero(0, 0, xpForLevel(8))], []))).toBe(6);
    expect(levelFor(recruitXp([hero()], ["veterans-1"]))).toBe(3);
  });
});

describe("skill picks", () => {
  const lv = (level: number, cls: Hero["cls"] = "knight"): Hero => ({
    ...hero(0, 0, xpForLevel(level)),
    cls,
  });
  const take = (h: Hero, ...ids: string[]) => ids.reduce(learnSkill, h);

  it("gives every class five either/or rows", () => {
    for (const cls of ["knight", "mage", "archer", "cleric"] as const) {
      const mine = SKILLS.filter((n) => n.cls === cls);
      expect(mine).toHaveLength(10);
      expect(new Set(mine.map((n) => n.level))).toEqual(new Set([2, 4, 6, 8, 10]));
    }
  });

  it("opens a pick every other level, and taking one option locks the other", () => {
    const h = lv(5);
    expect(skillPoints(h)).toBe(2);
    expect(canLearn(h, "knight-6a")).toBe(false);
    expect(canLearn(h, "mage-2a")).toBe(false);
    const after = take(h, "knight-2a", "knight-2b", "knight-4b");
    expect(after.skills).toEqual(["knight-2a", "knight-4b"]);
    expect(skillPoints(after)).toBe(0);
  });

  it("adds power picks, and Shield wall lifts the other heroes", () => {
    const wall = take(lv(10), "knight-2a", "knight-6a", "knight-10a");
    const ally = lv(1, "mage");
    // Leader: 1 + level steps 3 + Sturdy 2 + Bulwark 3; ally: 1 + Shield wall 1.
    expect(power([wall, ally])).toBe(9 + 2);
  });

  it("adds stat picks to the party bonuses and charges for a respec", () => {
    const mage = take(lv(4, "mage"), "mage-2b", "mage-4b");
    expect(partyBonuses([mage]).goldPct).toBe(12 + 10);
    expect(partyBonuses([mage]).fightPct).toBe(10);
    expect(respecCost(mage)).toBe(40);
  });

  it("discounts gear with Insight and brings recruits up with Rally", () => {
    const mage = take(lv(8, "mage"), "mage-8a");
    expect(gearCost(hero(0), "weapon", [mage])).toBe(24);
    const knight = take(lv(8), "knight-8a");
    expect(levelFor(recruitXp([knight], []))).toBe(8);
  });

  it("drops picks a save shouldn't have", () => {
    const h = { ...lv(4), skills: ["knight-4a", "knight-4b", "mage-2a", "knight-6a"] };
    expect(validSkills(h)).toEqual(["knight-4a"]);
  });
});
