import { describe, expect, it } from "vitest";
import {
  ParseError,
  parseDice,
  parseInteger,
  parseQualified,
  parseRange,
  parseStowage,
  parseWeightKg,
  slug,
  splitList,
} from "../src/data/parse.ts";

describe("cell parsers", () => {
  it("reads dice, treating the sheet's slash as plus", () => {
    expect(parseDice("1d20/1d10")).toEqual([
      { count: 1, sides: 20 },
      { count: 1, sides: 10 },
    ]);
    expect(parseDice("10d20")).toEqual([{ count: 10, sides: 20 }]);
    expect(parseDice("2d20+1d6")).toHaveLength(2);
    expect(() => parseDice("1d20/x")).toThrow(ParseError);
  });

  it("reads integers with thousands separators", () => {
    expect(parseInteger("53125")).toBe(53125);
    expect(parseInteger("1,000")).toBe(1000);
    expect(() => parseInteger("12.5")).toThrow(ParseError);
    expect(() => parseInteger("")).toThrow(ParseError);
  });

  it("reads ranges, keeping any note", () => {
    expect(parseRange("600m/1,000m")).toEqual({ effectiveM: 600, maxM: 1000 });
    expect(parseRange("25m/50m (200m w/ stock)")).toEqual({ effectiveM: 25, maxM: 50, note: "200m w/ stock" });
    expect(() => parseRange("500m")).toThrow(ParseError);
  });

  it("reads weight and stowage", () => {
    expect(parseWeightKg("3.07 kg")).toBe(3.07);
    expect(parseStowage("943mm (37.1in)/700mm (27.6in)")).toEqual({ extendedMm: 943, collapsedMm: 700 });
    expect(parseStowage("943mm (37.1in)/N/A")).toEqual({ extendedMm: 943, collapsedMm: null });
    expect(() => parseStowage("long/short")).toThrow(ParseError);
  });

  it("makes IDs and splits lists", () => {
    expect(slug("5.45x39mm")).toBe("5-45x39mm");
    expect(slug(" Hollow-Point ")).toBe("hollow-point");
    expect(splitList("Malachite, Corps")).toEqual(["Malachite", "Corps"]);
    expect(splitList("N/A")).toEqual([]);
    expect(parseQualified("IPSF (usually)")).toEqual({ name: "IPSF", note: "usually" });
  });
});
