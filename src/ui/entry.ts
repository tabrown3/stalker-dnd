// Pure helpers for the "enter my own dice" flow, kept out of the components so
// they can be tested.
import type { PullHit } from "../engine/attack.ts";
import type { Roller } from "../engine/dice.ts";

/** Parses a typed roll; returns null unless it's a whole number from 1 to sides. */
export function parseRoll(text: string, sides: number): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= sides ? n : null;
}

/** Empty damage-entry fields: pull -> hit round -> die. */
export function blankDamageEntry(pulls: PullHit[], diceSides: number[]): string[][][] {
  return pulls.map((p) => Array.from({ length: p.roundsHit }, () => diceSides.map(() => "")));
}

/** Fills only the empty fields with rolls, leaving anything typed alone. */
export function fillEmpty(texts: string[], sides: number[], roll: Roller): string[] {
  return texts.map((t, i) => (t.trim() === "" ? String(roll(sides[i]!)) : t));
}

/**
 * Orders entered rolls the way resolveTurn consumes them: each pull's d20,
 * then that pull's damage dice round by round. Null if any roll is invalid.
 */
export function orderedRolls(d20s: string[], damage: string[][][], diceSides: number[]): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < d20s.length; i++) {
    const d20 = parseRoll(d20s[i]!, 20);
    if (d20 === null) return null;
    out.push(d20);
    for (const round of damage[i] ?? []) {
      for (let k = 0; k < diceSides.length; k++) {
        const v = parseRoll(round[k] ?? "", diceSides[k]!);
        if (v === null) return null;
        out.push(v);
      }
    }
  }
  return out;
}
