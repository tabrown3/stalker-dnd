import { describe, expect, it } from "vitest";
import type { PullHit } from "../src/engine/attack.ts";
import { scriptedRoller } from "../src/engine/dice.ts";
import { blankDamageEntry, fillEmpty, orderedRolls, parseRoll } from "../src/ui/entry.ts";

const hit = (roundsHit: number): PullHit => ({
  roundsFired: 3,
  fireMode: "burst",
  fireModeMod: 0,
  d20: 10,
  toHit: 10,
  margin: 0,
  hit: roundsHit > 0,
  roundsHit,
  roundsMissed: 3 - roundsHit,
});

describe("dice entry", () => {
  it("accepts only rolls that fit the die", () => {
    expect(parseRoll("20", 20)).toBe(20);
    expect(parseRoll(" 7 ", 10)).toBe(7);
    expect(parseRoll("0", 20)).toBeNull();
    expect(parseRoll("11", 10)).toBeNull();
    expect(parseRoll("2.5", 20)).toBeNull();
    expect(parseRoll("", 20)).toBeNull();
  });

  it("asks for each hit round's dice and orders rolls the way the engine reads them", () => {
    const sides = [20, 10]; // 5.45x39mm: 1d20 + 1d10
    const blank = blankDamageEntry([hit(2), hit(0), hit(1)], sides);
    expect(blank).toEqual([[["", ""], ["", ""]], [], [["", ""]]]);
    const damage = [[["14", "6"], ["8", "3"]], [], [["2", "1"]]];
    expect(orderedRolls(["17", "4", "12"], damage, sides)).toEqual([17, 14, 6, 8, 3, 4, 12, 2, 1]);
    expect(orderedRolls(["17", "4", "12"], [[["14", "11"], ["8", "3"]], [], [["2", "1"]]], sides)).toBeNull();
  });

  it("rolls only the empty fields", () => {
    expect(fillEmpty(["5", "", " "], [20, 10, 6], scriptedRoller([9, 4]))).toEqual(["5", "9", "4"]);
  });
});
