import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convert } from "../src/data/convert.ts";
import { SOURCE_CSV, outputFiles, runPipeline } from "../src/data/pipeline.ts";
import { type Grid, readGrid } from "../src/data/sheet.ts";

const { data, issues } = runPipeline();
if (!data) throw new Error(`Pipeline failed: ${JSON.stringify(issues, null, 2)}`);

const weapon = (name: string) => data.weapons.find((w) => w.name === name)!;
const armor = (name: string) => data.armor.find((a) => a.name === name)!;
const codes = (code: string) => issues.filter((i) => i.code === code);

describe("conversion of the real sheet", () => {
  it("finds every record", () => {
    expect(data.weapons).toHaveLength(62);
    expect(data.ammo).toHaveLength(14);
    expect(data.ammoVariants.map((v) => v.id)).toEqual(["ap", "hollow-point"]);
    expect(data.armor).toHaveLength(56);
    expect(data.factions).toHaveLength(11);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("parses weapon fields", () => {
    const ak = weapon("AK-74");
    expect(ak.damage).toEqual([
      { count: 1, sides: 20 },
      { count: 1, sides: 10 },
    ]);
    expect(ak).toMatchObject({ ammoId: "5-45x39mm", velocity: 3, ap: 4, valueTk: 10000, weightKg: 3.07 });
    expect(ak.stowage).toEqual({ extendedMm: 943, collapsedMm: null });
    expect(weapon("HK417A2").range).toEqual({ effectiveM: 600, maxM: 1000 });
    expect(weapon("Stechkin").range.note).toBe("200m w/ stock");
  });

  it("reads ammo tiers and the AC row from the sheet", () => {
    const tier = (id: string) => data.ammo.find((a) => a.id === id)!.tier;
    expect(tier("9x19mm")).toBe("II");
    expect(tier("5-45x39mm")).toBe("III");
    expect(tier("7-62x54mmr")).toBe("III+");
    expect(tier("12-7x55mm")).toBe("Undefendable");
    expect(data.tables.acByLevel).toEqual({ base: 10, II: 11, IIIA: 12, III: 13, "III+": 14, IV: 15 });
    expect(data.tables.currency.tkPerGp).toBe(10);
    expect(data.tables.sourceText.combatRules).toHaveLength(6);
  });

  it("normalizes armor and factions", () => {
    expect(armor("6B47 Helmet").level).toBe("II"); // sheet has "II " with a trailing space
    expect(armor("GP-5 Gas Mask").level).toBeNull();
    expect(armor("Berill-5M Armored Suit").factionIds).toEqual(["ipsf", "corps"]);
    expect(armor("SSP-100M SIRCAA").prot.thermal).toBe(97); // flagged, not changed
    const loners = data.factions.find((f) => f.id === "loners")!;
    expect(loners.enemies).toEqual([{ factionId: "bandits" }, { factionId: "ipsf", note: "usually" }]);
    const mercs = data.factions.find((f) => f.id === "mercenaries")!;
    expect(mercs.allies).toBe("classified");
    const all = JSON.stringify(data.factions);
    expect(all).not.toContain('"mercs"');
  });
});

describe("validation of the real sheet", () => {
  it("flags the known data problems", () => {
    expect(codes("ammo-mismatch").map((i) => i.message)).toEqual(["9A91 Rnd AP 5 differs from 9x39mm ammo Rnd AP 6"]);
    expect(codes("prot-outlier").map((i) => i.message)).toEqual([expect.stringContaining("SSP-100M SIRCAA thermal")]);
    expect(codes("unknown-faction").map((i) => i.message)).toEqual([
      expect.stringContaining('"monolith"'),
      expect.stringContaining('"noontide"'),
    ]);
    expect(codes("relation-asymmetric")).toHaveLength(5);
    expect(codes("whitespace").map((i) => i.cell)).toEqual(["S5", "AF4", "AE7", "AF7"]);
    expect(codes("no-fire-modes")).toHaveLength(1);
  });
});

describe("robustness", () => {
  const base = readGrid(SOURCE_CSV);
  const copy = (): Grid => base.map((r) => [...r]);

  it("stops with an error, and no data, when a value can't be read", () => {
    const g = copy();
    g[1]![5] = "1d20/oops"; // AK-74 Rnd DMG
    const result = convert(g);
    expect(result.data).toBeUndefined();
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: "error", cell: "F2" }));
  });

  it("finds columns by header, so an inserted weapon column changes nothing", () => {
    const g = copy().map((row, r) => [...row.slice(0, 3), r === 0 ? "Fire Modes" : "", ...row.slice(3)]);
    const result = convert(g);
    expect(result.data?.weapons).toEqual(data.weapons);
    expect(result.data?.armor).toEqual(data.armor);
  });
});

describe("committed data files", () => {
  it("match a fresh run (run `npm run data` after changing the sheet or converter)", () => {
    for (const [path, contents] of Object.entries(outputFiles(data, issues))) {
      expect(readFileSync(path, "utf8").replace(/\r\n/g, "\n"), path).toBe(contents);
    }
  });
});
