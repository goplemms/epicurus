import type { HeroClass } from "./sprites";

/** A party member, the tier (0-3) of each gear slot, and the XP that sets its level. */
export interface Hero {
  name: string;
  cls: HeroClass;
  weapon: number;
  armor: number;
  /** Fractional while XP bonuses apply. */
  xp: number;
  /** Skill tree nodes taken, by id. */
  skills: string[];
}

export type Slot = "weapon" | "armor";
export const SLOTS: readonly Slot[] = ["weapon", "armor"];
export const MAX_TIER = 3;
export const MAX_PARTY = 4;
export const TIER_NAMES = ["plain", "bronze", "steel", "gold"] as const;

export const DEFAULT_HEROES: readonly { name: string; cls: HeroClass }[] = [
  { name: "Ada", cls: "knight" },
  { name: "Bram", cls: "mage" },
  { name: "Cass", cls: "archer" },
  { name: "Dot", cls: "cleric" },
];

/** Names to pick from; heroes are named from a list rather than typed in. */
export const HERO_NAMES: readonly string[] = [
  "Ada",
  "Bram",
  "Cass",
  "Dot",
  "Elric",
  "Fen",
  "Gwen",
  "Hale",
  "Ione",
  "Juno",
  "Kit",
  "Lark",
  "Mira",
  "Nell",
  "Orrin",
  "Pip",
];

/** The first listed name nobody in the party has yet. */
export function freeName(heroes: readonly Hero[]): string {
  return HERO_NAMES.find((n) => !heroes.some((h) => h.name === n)) ?? HERO_NAMES[0] ?? "Ada";
}

export function hash(n: number): number {
  let x = Math.imul(n | 0, 0x9e3779b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca77);
  x ^= x >>> 13;
  return x >>> 0;
}

// Each foe in a focus session is a walk, a fight, and a puff of smoke.
export const WALK_MS = 20_000;
export const POOF_MS = 2_000;

export const MAX_LEVEL = 10;
/** XP every hero gets per foe beaten, and per finished focus session. */
export const FOE_XP = 1;
export const FINISH_XP = 10;

/** Total XP to reach a level: going from level n to n + 1 costs 60 × n. */
export function xpForLevel(level: number): number {
  const l = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  return 30 * l * (l - 1);
}

export function levelFor(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** +1 power at levels 4, 7 and 10. */
export function levelPower(level: number): number {
  return Math.floor((level - 1) / 3);
}

/** One per hero, plus gear tiers, level steps and power skills; Shield wall lifts everyone else. */
export function power(heroes: readonly Hero[]): number {
  const walls = heroes.reduce((n, h) => n + sumSkill([h], "allyPower"), 0);
  return heroes.reduce(
    (p, h) =>
      p +
      1 +
      h.weapon +
      h.armor +
      levelPower(levelFor(h.xp)) +
      sumSkill([h], "power") +
      walls -
      sumSkill([h], "allyPower"),
    0,
  );
}

/** A stronger party wins its fights faster, so a session meets more foes. */
export function fightMsFor(p: number): number {
  return Math.max(3_000, 8_000 - 250 * p);
}

export type ClassPerkKind = "fightPct" | "goldPct" | "lootPts" | "xpPct";

/** Each class turns one dial, by `per` for every level the hero has. A new class or number is an entry here. */
export const CLASS_PERKS: Record<
  HeroClass,
  { name: string; kind: ClassPerkKind; per: number; text: (v: number) => string }
> = {
  knight: { name: "Vanguard", kind: "fightPct", per: 2, text: (v) => `${v}% shorter fights` },
  mage: { name: "Arcana", kind: "goldPct", per: 3, text: (v) => `+${v}% gold` },
  archer: { name: "Keen eye", kind: "lootPts", per: 1.5, text: (v) => `+${v}% loot chance` },
  cleric: { name: "Blessing", kind: "xpPct", per: 3, text: (v) => `+${v}% party XP` },
};

/** This hero's perk value at its current level. */
export function perkValue(hero: Hero): number {
  return CLASS_PERKS[hero.cls].per * levelFor(hero.xp);
}

/** Level perks plus stat skills, added up for the party; heroes of the same class stack. */
export function partyBonuses(heroes: readonly Hero[]): Record<ClassPerkKind, number> {
  const total: Record<ClassPerkKind, number> = {
    fightPct: sumSkill(heroes, "fightPct"),
    goldPct: sumSkill(heroes, "goldPct"),
    lootPts: sumSkill(heroes, "lootPts"),
    xpPct: sumSkill(heroes, "xpPct"),
  };
  for (const h of heroes) total[CLASS_PERKS[h.cls].kind] += perkValue(h);
  return total;
}

/** A skill's effect. Stat effects stack; the rest bend a rule. */
export type SkillEffect =
  | {
      kind:
        | ClassPerkKind
        | "power"
        | "allyPower"
        | "finishGold"
        | "finishXp"
        | "gearDiscountPct"
        | "extraLootRoll"
        | "abandonFinishPct"
        | "restXp"
        | "recruitFullLevel"
        | "nthFoeLoot";
      value: number;
    }
  | { kind: "nthFoe"; value: number; gold: boolean; xp: boolean };

export interface SkillNode {
  id: string;
  cls: HeroClass;
  /** The level that opens this pick; each level offers two options and you take one. */
  level: number;
  side: "A" | "B";
  name: string;
  effect: SkillEffect;
}

/** Levels that give a pick; the last row holds the capstones. */
export const PICK_LEVELS = [2, 4, 6, 8, 10] as const;
export const RESPEC_COST_PER_PICK = 20;

type Option = [name: string, effect: SkillEffect];

/** A class's rows of either/or options, one row per pick level. */
function picks(cls: HeroClass, rows: readonly [Option, Option][]): SkillNode[] {
  return rows.flatMap(([a, b], i) => {
    const level = PICK_LEVELS[i] ?? MAX_LEVEL;
    return [
      { id: `${cls}-${level}a`, cls, level, side: "A" as const, name: a[0], effect: a[1] },
      { id: `${cls}-${level}b`, cls, level, side: "B" as const, name: b[0], effect: b[1] },
    ];
  });
}

const stat = (kind: ClassPerkKind | "power", value: number): SkillEffect => ({ kind, value });

/** Every class's picks. A new option or class is a new entry here. */
export const SKILLS: readonly SkillNode[] = [
  ...picks("knight", [
    [
      ["Sturdy: +2 power", stat("power", 2)],
      ["Swift: 10% shorter fights", stat("fightPct", 10)],
    ],
    [
      ["Drillmaster: +10% party XP", stat("xpPct", 10)],
      ["Plunder: +10% gold", stat("goldPct", 10)],
    ],
    [
      ["Bulwark: +3 power", stat("power", 3)],
      ["Frenzy: 15% shorter fights", stat("fightPct", 15)],
    ],
    [
      ["Rally: recruits join at your best level", { kind: "recruitFullLevel", value: 1 }],
      ["Bounty: every 10th foe drops loot", { kind: "nthFoeLoot", value: 10 }],
    ],
    [
      ["Shield wall: every other hero +1 power", { kind: "allyPower", value: 1 }],
      ["Cleave: every 5th foe counts twice", { kind: "nthFoe", value: 5, gold: true, xp: true }],
    ],
  ]),
  ...picks("mage", [
    [
      ["Study: +10% party XP", stat("xpPct", 10)],
      ["Spark: +10% gold", stat("goldPct", 10)],
    ],
    [
      ["Ward: +2 power", stat("power", 2)],
      ["Haste: 10% shorter fights", stat("fightPct", 10)],
    ],
    [
      ["Lore: +15% party XP", stat("xpPct", 15)],
      ["Transmute: +15% gold", stat("goldPct", 15)],
    ],
    [
      ["Insight: gear 20% cheaper", { kind: "gearDiscountPct", value: 20 }],
      ["Scry: +10% loot chance", stat("lootPts", 10)],
    ],
    [
      [
        "Arcane surge: every 5th foe gives double XP",
        { kind: "nthFoe", value: 5, gold: false, xp: true },
      ],
      ["Golden touch: finish bonus 30 gold", { kind: "finishGold", value: 20 }],
    ],
  ]),
  ...picks("archer", [
    [
      ["Track: +10% party XP", stat("xpPct", 10)],
      ["Keen: +5% loot chance", stat("lootPts", 5)],
    ],
    [
      ["Forage: +10% gold", stat("goldPct", 10)],
      ["Quick: 10% shorter fights", stat("fightPct", 10)],
    ],
    [
      ["Skirmisher: +3 power", stat("power", 3)],
      ["Eagle eye: +8% loot chance", stat("lootPts", 8)],
    ],
    [
      ["Volley: 15% shorter fights", stat("fightPct", 15)],
      ["Poacher: every 10th foe drops loot", { kind: "nthFoeLoot", value: 10 }],
    ],
    [
      [
        "Big game: every 5th foe pays double gold",
        { kind: "nthFoe", value: 5, gold: true, xp: false },
      ],
      ["Treasure hunter: loot rolls twice", { kind: "extraLootRoll", value: 1 }],
    ],
  ]),
  ...picks("cleric", [
    [
      ["Bless: +10% party XP", stat("xpPct", 10)],
      ["Smite: +2 power", stat("power", 2)],
    ],
    [
      ["Tithe: +10% gold", stat("goldPct", 10)],
      ["Zeal: 10% shorter fights", stat("fightPct", 10)],
    ],
    [
      ["Litany: +15% party XP", stat("xpPct", 15)],
      ["Aegis: +3 power", stat("power", 3)],
    ],
    [
      ["Mercy: recruits join at your best level", { kind: "recruitFullLevel", value: 1 }],
      ["Sanctuary: finishing a rest gives 10 XP", { kind: "restXp", value: 10 }],
    ],
    [
      ["Grace: quitting early pays half the finish bonus", { kind: "abandonFinishPct", value: 50 }],
      ["Miracle: a finished session gives 30 XP", { kind: "finishXp", value: 20 }],
    ],
  ]),
];

export function skillNode(id: string): SkillNode | undefined {
  return SKILLS.find((n) => n.id === id);
}

/** Total of one effect kind over the given heroes' picks. */
export function sumSkill(heroes: readonly Hero[], kind: SkillEffect["kind"]): number {
  let total = 0;
  for (const h of heroes) {
    for (const id of h.skills) {
      const e = skillNode(id)?.effect;
      if (e?.kind === kind) total += e.value;
    }
  }
  return total;
}

/** The every-nth-foe picks the party has, one entry per hero that took one. */
export function nthFoeSkills(
  heroes: readonly Hero[],
): { value: number; gold: boolean; xp: boolean }[] {
  return heroes.flatMap((h) =>
    h.skills.flatMap((id) => {
      const e = skillNode(id)?.effect;
      return e?.kind === "nthFoe" ? [e] : [];
    }),
  );
}

/** Picks the hero has reached but not made yet. */
export function skillPoints(hero: Hero): number {
  const level = levelFor(hero.xp);
  return PICK_LEVELS.filter((l) => l <= level).length - hero.skills.length;
}

/** The option this hero took at a pick level, if any. */
export function pickAt(hero: Hero, level: number): SkillNode | undefined {
  return hero.skills.map(skillNode).find((n) => n?.level === level);
}

export function canLearn(hero: Hero, id: string): boolean {
  const node = skillNode(id);
  return (
    node !== undefined &&
    node.cls === hero.cls &&
    node.level <= levelFor(hero.xp) &&
    pickAt(hero, node.level) === undefined
  );
}

export function learnSkill(hero: Hero, id: string): Hero {
  return canLearn(hero, id) ? { ...hero, skills: [...hero.skills, id] } : hero;
}

export function respecCost(hero: Hero): number {
  return RESPEC_COST_PER_PICK * hero.skills.length;
}

/** Keeps the first valid pick per level, of the hero's class, at levels it has reached. */
export function validSkills(hero: Hero): string[] {
  return hero.skills.reduce(learnSkill, { ...hero, skills: [] }).skills;
}

/** Knights can halve a fight at most. */
export const MIN_FIGHT_MS = 1_500;

/** Fight length for this party: its power, then the knights' Vanguard. */
export function partyFightMs(heroes: readonly Hero[]): number {
  const cut = Math.min(50, partyBonuses(heroes).fightPct) / 100;
  return Math.max(MIN_FIGHT_MS, Math.round(fightMsFor(power(heroes)) * (1 - cut)));
}

export function cycleMs(fightMs: number): number {
  return WALK_MS + fightMs + POOF_MS;
}

/** Foes beaten after this much focus time; a foe counts once its fight ends. */
export function foesBeaten(elapsedMs: number, fightMs: number): number {
  const cycle = cycleMs(fightMs);
  return Math.floor(elapsedMs / cycle) + (elapsedMs % cycle >= WALK_MS + fightMs ? 1 : 0);
}

export const AREAS = [
  { name: "Desert", goldPerFoe: 1, unlockPower: 0 },
  { name: "Red canyon", goldPerFoe: 2, unlockPower: 10 },
] as const;

/** The furthest area the party is strong enough for. */
export function areaFor(p: number): number {
  let area = 0;
  AREAS.forEach((a, i) => {
    if (p >= a.unlockPower) area = i;
  });
  return area;
}

export const FINISH_BONUS = 10;
export const LOOT_CHANCE = 0.2;
/** Cost to raise a slot to tier 1, 2, 3. */
export const GEAR_COST = [30, 90, 250] as const;
/** Cost of the 2nd, 3rd and 4th hero. */
export const RECRUIT_COST = [80, 200, 450] as const;

export type Effect =
  | { kind: "goldPct"; pct: number }
  | { kind: "lootMult"; mult: number }
  | { kind: "startHeroes"; count: number }
  | { kind: "recruitDiscountPct"; pct: number }
  | { kind: "heirloom"; slot: Slot; tier: number }
  | { kind: "startLevel"; level: number }
  | { kind: "xpPct"; pct: number };

export interface TreeNode {
  id: string;
  branch: string;
  /** Each tier needs the one before it in the same branch. */
  tier: number;
  cost: number;
  name: string;
  effect: Effect;
}

/** The renown tree. A new node or branch is a new entry here. */
export const TREE: readonly TreeNode[] = [
  {
    id: "fortune-1",
    branch: "Fortune",
    tier: 1,
    cost: 1,
    name: "+10% gold",
    effect: { kind: "goldPct", pct: 10 },
  },
  {
    id: "fortune-2",
    branch: "Fortune",
    tier: 2,
    cost: 2,
    name: "+10% gold",
    effect: { kind: "goldPct", pct: 10 },
  },
  {
    id: "fortune-3",
    branch: "Fortune",
    tier: 3,
    cost: 3,
    name: "Loot drops twice as often",
    effect: { kind: "lootMult", mult: 2 },
  },
  {
    id: "muster-1",
    branch: "Muster",
    tier: 1,
    cost: 1,
    name: "Start with a second hero",
    effect: { kind: "startHeroes", count: 1 },
  },
  {
    id: "muster-2",
    branch: "Muster",
    tier: 2,
    cost: 2,
    name: "Recruits cost 25% less",
    effect: { kind: "recruitDiscountPct", pct: 25 },
  },
  {
    id: "muster-3",
    branch: "Muster",
    tier: 3,
    cost: 3,
    name: "Start with a third hero",
    effect: { kind: "startHeroes", count: 1 },
  },
  {
    id: "heirloom-1",
    branch: "Heirlooms",
    tier: 1,
    cost: 1,
    name: "Leader keeps a bronze weapon",
    effect: { kind: "heirloom", slot: "weapon", tier: 1 },
  },
  {
    id: "heirloom-2",
    branch: "Heirlooms",
    tier: 2,
    cost: 2,
    name: "The heirloom weapon is steel",
    effect: { kind: "heirloom", slot: "weapon", tier: 2 },
  },
  {
    id: "heirloom-3",
    branch: "Heirlooms",
    tier: 3,
    cost: 3,
    name: "Leader keeps steel armor too",
    effect: { kind: "heirloom", slot: "armor", tier: 2 },
  },
  {
    id: "veterans-1",
    branch: "Veterans",
    tier: 1,
    cost: 1,
    name: "Runs start at level 3",
    effect: { kind: "startLevel", level: 3 },
  },
  {
    id: "veterans-2",
    branch: "Veterans",
    tier: 2,
    cost: 2,
    name: "+25% XP",
    effect: { kind: "xpPct", pct: 25 },
  },
  {
    id: "veterans-3",
    branch: "Veterans",
    tier: 3,
    cost: 3,
    name: "Runs start at level 5",
    effect: { kind: "startLevel", level: 5 },
  },
];

export const BRANCHES: readonly string[] = [...new Set(TREE.map((n) => n.branch))];

/** Renown carries across runs; the rest of the game resets when the party retires. */
export interface Legacy {
  renown: number;
  owned: string[];
  retirements: number;
}

export interface Perks {
  goldMult: number;
  lootChance: number;
  startHeroes: number;
  recruitDiscount: number;
  heirloom: Record<Slot, number>;
  startLevel: number;
  xpMult: number;
}

export function perks(owned: readonly string[]): Perks {
  const p: Perks = {
    goldMult: 1,
    lootChance: LOOT_CHANCE,
    startHeroes: 0,
    recruitDiscount: 0,
    heirloom: { weapon: 0, armor: 0 },
    startLevel: 1,
    xpMult: 1,
  };
  for (const node of TREE) {
    if (!owned.includes(node.id)) continue;
    const e = node.effect;
    switch (e.kind) {
      case "goldPct":
        p.goldMult += e.pct / 100;
        break;
      case "lootMult":
        p.lootChance *= e.mult;
        break;
      case "startHeroes":
        p.startHeroes += e.count;
        break;
      case "recruitDiscountPct":
        p.recruitDiscount += e.pct / 100;
        break;
      case "heirloom":
        p.heirloom[e.slot] = Math.max(p.heirloom[e.slot], e.tier);
        break;
      case "startLevel":
        p.startLevel = Math.max(p.startLevel, e.level);
        break;
      case "xpPct":
        p.xpMult += e.pct / 100;
        break;
    }
  }
  return p;
}

export function canBuyNode(legacy: Legacy, node: TreeNode): boolean {
  if (legacy.owned.includes(node.id) || legacy.renown < node.cost) return false;
  return (
    node.tier === 1 ||
    TREE.some(
      (n) => n.branch === node.branch && n.tier === node.tier - 1 && legacy.owned.includes(n.id),
    )
  );
}

export function buyNode(legacy: Legacy, id: string): Legacy {
  const node = TREE.find((n) => n.id === id);
  if (!node || !canBuyNode(legacy, node)) return legacy;
  return { ...legacy, renown: legacy.renown - node.cost, owned: [...legacy.owned, id] };
}

/** The next tier's price, less the party's Insight discount (at most half). */
export function gearCost(hero: Hero, slot: Slot, party: readonly Hero[] = []): number | null {
  const base = GEAR_COST[hero[slot]];
  if (base === undefined) return null;
  const off = Math.min(50, sumSkill(party, "gearDiscountPct")) / 100;
  return Math.round(base * (1 - off));
}

export function recruitCost(heroes: readonly Hero[], owned: readonly string[]): number | null {
  const base = RECRUIT_COST[heroes.length - 1];
  if (base === undefined || heroes.length >= MAX_PARTY) return null;
  return Math.round(base * (1 - perks(owned).recruitDiscount));
}

export function renownFor(runGold: number): number {
  return Math.floor(Math.sqrt(Math.max(0, runGold) / 100));
}

export function canRetire(heroes: readonly Hero[]): boolean {
  return areaFor(power(heroes)) >= 1;
}

/** A new run's party: the leader, plus whatever the renown tree adds. */
export function startingParty(
  leader: { name: string; cls: HeroClass },
  owned: readonly string[],
): Hero[] {
  const p = perks(owned);
  const xp = xpForLevel(p.startLevel);
  const heroes: Hero[] = [
    { ...leader, weapon: p.heirloom.weapon, armor: p.heirloom.armor, xp, skills: [] },
  ];
  for (const d of DEFAULT_HEROES) {
    if (heroes.length > p.startHeroes || heroes.length >= MAX_PARTY) break;
    if (!heroes.some((h) => h.cls === d.cls))
      heroes.push({ ...d, weapon: 0, armor: 0, xp, skills: [] });
  }
  return heroes;
}

/** A recruit joins two levels below the party's best (Rally or Mercy: at it), so late joiners aren't dead weight. */
export function recruitXp(heroes: readonly Hero[], owned: readonly string[]): number {
  const best = Math.max(1, ...heroes.map((h) => levelFor(h.xp)));
  const behind = sumSkill(heroes, "recruitFullLevel") > 0 ? 0 : 2;
  return xpForLevel(Math.max(perks(owned).startLevel, best - behind));
}

/** Gives every hero `base` XP, scaled by Blessing and Veterans, and names anyone who levelled up. */
export function grantXp(
  heroes: readonly Hero[],
  base: number,
  owned: readonly string[],
): { heroes: Hero[]; text: string | null } {
  if (base <= 0) return { heroes: [...heroes], text: null };
  const gain = base * (perks(owned).xpMult + partyBonuses(heroes).xpPct / 100);
  const cap = xpForLevel(MAX_LEVEL);
  const next = heroes.map((h) => ({ ...h, xp: Math.min(cap, h.xp + gain) }));
  const up = next.filter((h, i) => levelFor(h.xp) > levelFor(heroes[i]?.xp ?? 0));
  if (!up.length) return { heroes: next, text: null };
  const text = up.map((h) => `${h.name || "A hero"} reached level ${levelFor(h.xp)}!`).join(" ");
  return { heroes: next, text };
}

/** A finished session sometimes upgrades one piece of gear. Seeded, so it is repeatable. */
export function rollLoot(
  heroes: readonly Hero[],
  seed: number,
  chance: number,
): { heroes: Hero[]; text: string } | null {
  if (hash(seed) / 2 ** 32 >= chance) return null;
  const open = heroes.flatMap((h, i) =>
    SLOTS.filter((s) => h[s] < MAX_TIER).map((s) => ({ i, s })),
  );
  const pick = open[hash(seed + 1) % Math.max(1, open.length)];
  if (!pick) return null;
  const hero = heroes[pick.i];
  if (!hero) return null;
  const tier = hero[pick.s] + 1;
  return {
    heroes: heroes.map((h, i) => (i === pick.i ? { ...h, [pick.s]: tier } : h)),
    text: `Loot! ${hero.name || "A hero"} found a ${TIER_NAMES[tier]} ${pick.s}.`,
  };
}
