import { describe, expect, it } from "vitest";
import {
  areaFor,
  buyNode,
  canBuyNode,
  canRetire,
  fightMsFor,
  foesBeaten,
  gearCost,
  type Hero,
  perks,
  power,
  recruitCost,
  renownFor,
  rollLoot,
  startingParty,
  TREE,
  WALK_MS,
} from "./economy";

const hero = (weapon = 0, armor = 0): Hero => ({ name: "Ada", cls: "knight", weapon, armor });

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
