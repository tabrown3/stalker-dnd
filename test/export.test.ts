import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Dataset } from "../src/data/schema.ts";
import {
  ImportError,
  PREFIX,
  base64url,
  buildExport,
  dataFingerprint,
  decodeExport,
  encodeExport,
  fromBase64url,
  replayExport,
  rollsOf,
} from "../src/debug/export.ts";
import { resolveTurn, type AttackInput } from "../src/engine/attack.ts";
import { scriptedRoller } from "../src/engine/dice.ts";
import { DEFAULT_SETTINGS } from "../src/engine/settings.ts";
import { APP_VERSION } from "../src/version.ts";

const json = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const ammoFile = json("data/ammo.json");
const data = Dataset.parse({
  weapons: json("data/weapons.json"),
  ammo: ammoFile.calibers,
  ammoVariants: ammoFile.variants,
  armor: json("data/armor.json"),
  factions: json("data/factions.json"),
  tables: json("data/tables.json"),
});
const byName = <T extends { name: string }>(l: T[], n: string) => l.find((x) => x.name === n)!;

// Example 3 from docs/worked-examples.md.
const ak = byName(data.weapons, "AK-74");
const input: AttackInput = {
  weapon: ak,
  ammo: data.ammo.find((a) => a.id === ak.ammoId)!,
  variantId: null,
  targetArmor: [byName(data.armor, "PSZ-5D"), byName(data.armor, "GP-5 Gas Mask")],
  distanceM: 150,
  mounted: false,
  pulls: [3],
};
const rolls = [17, 14, 6, 8, 3];
const result = resolveTurn(input, { tables: data.tables, ammoVariants: data.ammoVariants, roll: scriptedRoller(rolls) });
const exp = buildExport({
  input,
  result,
  rolledBy: "player",
  note: "  Round 2 feels low — ëxtra 🎯 ",
  app: APP_VERSION,
  build: "abc1234",
  data,
  now: new Date("2026-11-27T20:00:00Z"),
});

describe("debug export", () => {
  it("records the setup by ID, the rolls in engine order, and what the player saw", () => {
    expect(exp).toMatchObject({
      format: 1,
      app: "0.1.0",
      build: "abc1234",
      at: "2026-11-27T20:00:00.000Z",
      input: { weapon: "ak-74", variant: null, body: "psz-5d", head: "gp-5-gas-mask", distanceM: 150, mounted: false, pulls: [3] },
      rolls,
      note: "Round 2 feels low — ëxtra 🎯",
    });
    expect(exp.seen).toEqual({ total: result.totalDamage, rounds: [result.pulls[0]!.rounds.map((r) => r.damage)] });
    expect(rollsOf(result)).toEqual(rolls);
  });

  it("round-trips through the code, including non-ASCII notes", () => {
    const code = encodeExport(exp);
    expect(code.startsWith(PREFIX)).toBe(true);
    expect(code).toMatch(/^ZC1:[A-Za-z0-9_-]+\.$/);
    expect(code.length).toBeLessThan(700);
    expect(decodeExport(code)).toEqual(exp);
  });

  it("survives what messaging apps do: surrounding text and line breaks", () => {
    const code = encodeExport(exp);
    const mangled = `hey can you check this?\n${code.slice(0, 40)}\n${code.slice(40, 90)} ${code.slice(90)} thanks!`;
    expect(decodeExport(mangled)).toEqual(exp);
    // A code that lost its end dot still works if it's unbroken.
    expect(decodeExport(code.slice(0, -1))).toEqual(exp);
  });

  it("explains bad input", () => {
    expect(() => decodeExport("hello")).toThrow(/should start with ZC1:/);
    expect(() => decodeExport("ZC1:abc")).toThrow(ImportError);
    expect(() => decodeExport(PREFIX + base64url([...'{"format":2}'].map((c) => c.charCodeAt(0))) + ".")).toThrow(/format-1/);
    expect(() => decodeExport(encodeExport(exp).slice(0, 60) + ".")).toThrow(ImportError);
  });

  it("encodes base64url like the standard", () => {
    const bytes = [...Buffer.from("any carnal pleasé", "utf8")];
    expect(base64url(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
    expect(fromBase64url(Buffer.from(bytes).toString("base64url"))).toEqual(bytes);
  });
});

describe("replay", () => {
  it("reproduces the player's result on the same version and data", () => {
    const r = replayExport(decodeExport(encodeExport(exp)), data);
    expect(r).toMatchObject({ differs: false, sameData: true });
    expect(r.result).toEqual(result);
  });

  it("flags when the current rules give a different answer", () => {
    const otherProt = { ...DEFAULT_SETTINGS, protColumn: "rad" as const };
    const r = replayExport(exp, data, otherProt);
    expect(r.differs).toBe(true);
  });

  it("flags changed game data", () => {
    const changed = { ...data, weapons: data.weapons.map((w) => (w.id === "ak-74" ? { ...w, velocity: 4 } : w)) };
    const r = replayExport(exp, changed);
    expect(r).toMatchObject({ sameData: false, differs: true });
    expect(dataFingerprint(changed)).not.toBe(dataFingerprint(data));
  });

  it("explains exports it can't replay", () => {
    expect(() => replayExport({ ...exp, input: { ...exp.input, weapon: "laser-rifle" } }, data)).toThrow(/no weapon "laser-rifle"/);
    expect(() => replayExport({ ...exp, rolls: [17, 14] }, data)).toThrow(/different dice/);
    expect(() => replayExport({ ...exp, input: { ...exp.input, pulls: [31] } }, data)).toThrow(/won't allow/);
  });
});

describe("version", () => {
  it("matches package.json and app.json", () => {
    expect(json("package.json").version).toBe(APP_VERSION);
    expect(json("app.json").expo.version).toBe(APP_VERSION);
  });
});
