import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Dataset } from "../src/data/schema.ts";
import { AttackError, rangeModFor, resolveTurn, type AttackInput } from "../src/engine/attack.ts";
import { randomRoller, scriptedRoller } from "../src/engine/dice.ts";
import { DEFAULT_SETTINGS, type RuleSettings } from "../src/engine/settings.ts";

// Uses the committed data files, as the app will.
const json = (f: string) => JSON.parse(readFileSync(`data/${f}.json`, "utf8"));
const ammoFile = json("ammo");
const data = Dataset.parse({
  weapons: json("weapons"),
  ammo: ammoFile.calibers,
  ammoVariants: ammoFile.variants,
  armor: json("armor"),
  factions: json("factions"),
  tables: json("tables"),
});

const find = <T extends { name: string }>(list: T[], name: string): T => {
  const x = list.find((i) => i.name === name);
  if (!x) throw new Error(`No "${name}" in the data`);
  return x;
};

interface Scenario {
  weapon: string;
  variant?: "ap" | "hollow-point";
  armor?: string[];
  distanceM: number;
  mounted?: boolean;
  pulls: number[];
}

const input = (sc: Scenario): AttackInput => {
  const weapon = find(data.weapons, sc.weapon);
  return {
    weapon,
    ammo: data.ammo.find((a) => a.id === weapon.ammoId)!,
    variantId: sc.variant ?? null,
    targetArmor: (sc.armor ?? []).map((n) => find(data.armor, n)),
    distanceM: sc.distanceM,
    mounted: sc.mounted,
    pulls: sc.pulls,
  };
};

/** Rolls are in order: each pull's d20, then that pull's damage dice, round by round. */
const run = (sc: Scenario, rolls: number[], settings?: RuleSettings) => {
  const roll = scriptedRoller(rolls);
  const result = resolveTurn(input(sc), { tables: data.tables, ammoVariants: data.ammoVariants, settings, roll });
  expect(roll.remaining(), "unused scripted rolls").toBe(0);
  return result;
};

const roundDamage = (r: ReturnType<typeof run>) => r.pulls.flatMap((p) => p.rounds.map((x) => x.damage));

// docs/worked-examples.md. Update both together.
describe("worked examples", () => {
  it("1: pistol vs. an unarmored target", () => {
    const r = run({ weapon: "Glock-17", distanceM: 3, pulls: [1] }, [15, 12]);
    expect(r).toMatchObject({ targetAc: 10, rangeMod: 2, totalDamage: 14 });
    expect(r.pulls[0]).toMatchObject({ toHit: 18, margin: 8, roundsHit: 1 });
  });

  it("2: ammo below the armor's level is halved", () => {
    const r = run({ weapon: "M9", armor: ["PSZ-5D"], distanceM: 20, pulls: [1] }, [17, 15]);
    expect(r.targetAc).toBe(13);
    expect(r.pulls[0]!.rounds[0]).toMatchObject({ tierStep: "lower", afterTier: 8, protRemoved: 4, afterProt: 4, damage: 6 });
    expect(r.totalDamage).toBe(6);
  });

  it("3: same tier removes 25%, burst", () => {
    const r = run({ weapon: "AK-74", armor: ["PSZ-5D"], distanceM: 150, pulls: [3] }, [17, 14, 6, 8, 3]);
    expect(r.pulls[0]).toMatchObject({ fireMode: "burst", toHit: 17, roundsHit: 2, roundsMissed: 1 });
    expect(r.pulls[0]!.rounds.map((x) => x.afterTier)).toEqual([15, 8]);
    expect(roundDamage(r)).toEqual([11, 7]);
    expect(r.totalDamage).toBe(18);
  });

  it("4: example 3 with AP rounds", () => {
    const r = run({ weapon: "AK-74", variant: "ap", armor: ["PSZ-5D"], distanceM: 150, pulls: [3] }, [17, 14, 6, 8, 3, 2, 1]);
    expect(r).toMatchObject({ targetAc: 13, ap: 4, effectiveAc: 9 });
    expect(r.pulls[0]!.roundsHit).toBe(3);
    expect(roundDamage(r)).toEqual([15, 11, 8]);
    expect(r.totalDamage).toBe(34);
  });

  it("5: ammo above the armor's level does full damage", () => {
    const r = run({ weapon: "SVD", armor: ["Sunrise Suit"], distanceM: 600, pulls: [1] }, [16, 14, 9, 17]);
    expect(r.rangeMod).toBe(0);
    expect(r.pulls[0]!.rounds[0]).toMatchObject({ tierStep: "higher", afterTier: 40, afterProt: 24, damage: 28 });
  });

  it("6: beating AC by 1 still lands 1 round", () => {
    const r = run({ weapon: "Fort-12", armor: ["Wind of Freedom Suit"], distanceM: 10, pulls: [1] }, [11, 9]);
    expect(r.pulls[0]).toMatchObject({ toHit: 12, margin: 1, roundsHit: 1 });
    expect(r.pulls[0]!.rounds[0]).toMatchObject({ tierStep: "equal", afterTier: 6, afterProt: 4, damage: 6 });
  });

  it("7: hollow-point shotgun vs. a mask only", () => {
    const r = run({ weapon: "SPAS-12", variant: "hollow-point", armor: ["GP-5 Gas Mask"], distanceM: 4, pulls: [1] }, [10, 11, 5, 18, 7]);
    expect(r).toMatchObject({ armorLevel: null, targetAc: 10, protPercent: 25 });
    expect(r.pulls[0]!.rounds[0]).toMatchObject({ tierStep: "unarmored", afterProt: 30, hollowPoint: 4, damage: 36 });
  });

  it("8: Undefendable ammo vs. level IV", () => {
    const r = run({ weapon: "RSh-12", armor: ["Exoskeleton"], distanceM: 20, pulls: [1] }, [18, 13, 16, 4, 10]);
    expect(r.targetAc).toBe(15);
    expect(r.pulls[0]!.rounds[0]).toMatchObject({ tierStep: "higher", protRemoved: 28, damage: 16 });
  });

  it("9: unmounted GPMG on full auto, beyond range", () => {
    const r = run({ weapon: "PKM", armor: ["Recruit Suit"], distanceM: 900, mounted: false, pulls: [30] }, [20, 9, 12, 15]);
    expect(r).toMatchObject({ rangeMod: -3, unmountedMod: -2, roundsHit: 1, roundsMissed: 29, totalDamage: 32 });
    expect(r.pulls[0]).toMatchObject({ fireMode: "auto", toHit: 14 });
  });

  it("10: AP rounds vs. several pieces, Prot adds past 100%", () => {
    const sc = { weapon: "HK416A5", variant: "ap" as const, armor: ["PSZ-9D Duty Armor", "Sphere M20 Helmet", "GP-5 Gas Mask"], distanceM: 200, pulls: [10] };
    const r = run(sc, [17, 13, 9, 6, 15]);
    expect(r).toMatchObject({ armorLevel: "IV", effectiveAc: 11, protPercent: 145 });
    expect(r.pulls[0]!.rounds.map((x) => [x.afterTier, x.afterProt, x.damage])).toEqual([
      [11, 0, 7],
      [11, 0, 7],
    ]);
    expect(r.totalDamage).toBe(14);
    // The doc's follow-up: normal rounds hit 1 round for 3 damage.
    const normal = run({ ...sc, variant: undefined }, [17, 13, 9]);
    expect(normal).toMatchObject({ effectiveAc: 15, roundsHit: 1, totalDamage: 3 });
  });

  it("11: several trigger pulls in one turn", () => {
    const r = run({ weapon: "Glock-17", armor: ["Sunrise Suit"], distanceM: 15, pulls: [1, 1, 1] }, [16, 18, 9, 19, 7]);
    expect(r.pulls.map((p) => [p.toHit, p.hit, p.damage])).toEqual([
      [17, true, 7],
      [10, false, 0],
      [20, true, 4],
    ]);
    expect(r.totalDamage).toBe(11);
  });
});

describe("rules beyond the examples", () => {
  it("meeting the AC exactly is a hit for 1 round", () => {
    const r = run({ weapon: "Fort-12", armor: ["Wind of Freedom Suit"], distanceM: 10, pulls: [1] }, [10, 9]);
    expect(r.pulls[0]).toMatchObject({ toHit: 11, margin: 0, hit: true, roundsHit: 1 });
  });

  it("one below the AC misses and rolls no damage", () => {
    const r = run({ weapon: "AK-74", armor: ["PSZ-5D"], distanceM: 150, pulls: [5] }, [12]);
    expect(r.pulls[0]).toMatchObject({ margin: -1, hit: false, roundsHit: 0, roundsMissed: 5 });
    expect(r.totalDamage).toBe(0);
  });

  it("AP rounds don't lower an unarmored target's AC, but add damage (setting)", () => {
    const sc = { weapon: "AK-74", variant: "ap" as const, distanceM: 50, pulls: [1] };
    const r = run(sc, [10, 5, 5]);
    expect(r).toMatchObject({ targetAc: 10, effectiveAc: 10 });
    expect(r.pulls[0]!.rounds[0]).toMatchObject({ ap: 4, damage: 10 + 3 + 4 });
    const off = run(sc, [10, 5, 5], { ...DEFAULT_SETTINGS, apDamageVsUnarmored: false });
    expect(off.pulls[0]!.rounds[0]).toMatchObject({ ap: 0, damage: 13 });
  });

  it("mounting a GPMG removes the penalty", () => {
    const r = run({ weapon: "PKM", distanceM: 100, mounted: true, pulls: [1] }, [1]);
    expect(r.unmountedMod).toBe(0);
  });

  it("applies range bands at their edges", () => {
    const pkm = find(data.weapons, "PKM"); // 500m/800m
    expect([5, 5.5, 800, 801].map((d) => rangeModFor(pkm, d))).toEqual([2, 0, 0, -3]);
  });

  it("never lets armor push dice damage below 0", () => {
    const r = run({ weapon: "Fort-12", armor: ["Diamond Exoskeleton", "PA-7 Gas Mask"], distanceM: 1, pulls: [1] }, [20, 1]);
    expect(r.pulls[0]!.rounds[0]).toMatchObject({ afterTier: 1, afterProt: 0, damage: 2 });
  });
});

describe("attack limits", () => {
  const attempt = (sc: Scenario) => () =>
    resolveTurn(input(sc), { tables: data.tables, ammoVariants: data.ammoVariants, roll: randomRoller });

  it("single-shot weapons fire 1 round per pull, up to 6 pulls", () => {
    expect(attempt({ weapon: "Glock-17", distanceM: 10, pulls: [3] })).toThrow(AttackError);
    expect(attempt({ weapon: "RPG-7V1", distanceM: 10, pulls: [2] })).toThrow(AttackError);
    expect(attempt({ weapon: "Glock-17", distanceM: 10, pulls: [1, 1, 1, 1, 1, 1] })).not.toThrow();
    expect(attempt({ weapon: "Glock-17", distanceM: 10, pulls: [1, 1, 1, 1, 1, 1, 1] })).toThrow(/at most 6/);
  });

  it("caps rounds a turn at 30, or 40 for LMGs, across pulls", () => {
    expect(attempt({ weapon: "AK-74", distanceM: 10, pulls: [20, 10] })).not.toThrow();
    expect(attempt({ weapon: "AK-74", distanceM: 10, pulls: [20, 10, 1] })).toThrow(/at most 30/);
    expect(attempt({ weapon: "RPK-74", distanceM: 10, pulls: [40] })).not.toThrow();
    expect(attempt({ weapon: "PKM", distanceM: 10, pulls: [31] })).toThrow(/at most 30/);
  });

  it("rejects bad input", () => {
    expect(attempt({ weapon: "AK-74", distanceM: 10, pulls: [] })).toThrow(AttackError);
    expect(attempt({ weapon: "AK-74", distanceM: 10, pulls: [0] })).toThrow(AttackError);
    expect(attempt({ weapon: "AK-74", distanceM: -1, pulls: [1] })).toThrow(AttackError);
    const wrongAmmo = { ...input({ weapon: "AK-74", distanceM: 10, pulls: [1] }), ammo: data.ammo[1]! };
    expect(() => resolveTurn(wrongAmmo, { tables: data.tables, ammoVariants: data.ammoVariants, roll: randomRoller })).toThrow(/fires 5-45x39mm/);
  });
});

describe("dice", () => {
  it("random rolls stay on the die", () => {
    for (let i = 0; i < 1000; i++) {
      const v = randomRoller(6);
      expect(v >= 1 && v <= 6 && Number.isInteger(v)).toBe(true);
    }
  });

  it("scripted rolls must fit the die", () => {
    expect(() => scriptedRoller([21])(20)).toThrow();
    expect(() => scriptedRoller([])(20)).toThrow(/Ran out/);
  });
});
