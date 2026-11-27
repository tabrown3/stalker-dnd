// Parsers for the sheet's free-form cell values. Each throws ParseError with a
// readable message; the converter attaches the cell reference.
import type { Dice, Range, Stowage } from "./schema.ts";

export class ParseError extends Error {}

const NA = "N/A";
export const isNA = (s: string): boolean => s.trim().toUpperCase() === NA;

/** "10000" or "1,000" -> number. */
export function parseInteger(s: string): number {
  const t = s.trim().replace(/,/g, "");
  if (!/^-?\d+$/.test(t)) throw new ParseError(`not a whole number: "${s}"`);
  return Number(t);
}

/** "1d20/1d10" (the sheet's slash means plus) or "1d20+1d10" -> dice list. */
export function parseDice(s: string): Dice[] {
  const parts = s.trim().split(/\s*[/+]\s*/);
  return parts.map((p) => {
    const m = /^(\d+)d(\d+)$/i.exec(p);
    if (!m) throw new ParseError(`not a dice expression: "${s}"`);
    return { count: Number(m[1]), sides: Number(m[2]) };
  });
}

export const formatDice = (dice: Dice[]): string => dice.map((d) => `${d.count}d${d.sides}`).join("+");

/** "500m/800m", "600m/1,000m", "25m/50m (200m w/ stock)" -> meters. */
export function parseRange(s: string): Range {
  const m = /^\s*([\d,]+)\s*m\s*\/\s*([\d,]+)\s*m\s*(?:\((.+)\))?\s*$/.exec(s);
  if (!m) throw new ParseError(`not a range like "500m/800m": "${s}"`);
  const range: Range = { effectiveM: parseInteger(m[1]!), maxM: parseInteger(m[2]!) };
  if (m[3]) range.note = m[3].trim();
  return range;
}

/** "3.07 kg" -> 3.07. */
export function parseWeightKg(s: string): number {
  const m = /^\s*(\d+(?:\.\d+)?)\s*kg\s*$/i.exec(s);
  if (!m) throw new ParseError(`not a weight like "3.07 kg": "${s}"`);
  return Number(m[1]);
}

/** "943mm (37.1in)/700mm (27.6in)" or "943mm (37.1in)/N/A" -> millimeters. */
export function parseStowage(s: string): Stowage {
  const m = /^\s*(.+?)\s*\/\s*(N\/A|.+?)\s*$/.exec(s);
  if (!m) throw new ParseError(`not a stowage like "943mm/700mm": "${s}"`);
  const length = (part: string): number | null => {
    if (isNA(part)) return null;
    const lm = /^(\d+(?:\.\d+)?)\s*mm(?:\s*\([^)]*\))?$/.exec(part);
    if (!lm) throw new ParseError(`not a length like "943mm (37.1in)": "${part}" in "${s}"`);
    return Number(lm[1]);
  };
  return { extendedMm: length(m[1]!), collapsedMm: length(m[2]!) };
}

/** "Hollow-Point Variant" -> "hollow-point", "5.45x39mm" -> "5-45x39mm". */
export function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** "Malachite, Corps" -> ["Malachite", "Corps"]; "N/A" or blank -> []. */
export function splitList(s: string): string[] {
  if (isNA(s) || s.trim() === "") return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "");
}

/** "IPSF (usually)" -> { name: "IPSF", note: "usually" }. */
export function parseQualified(s: string): { name: string; note?: string } {
  const m = /^(.+?)\s*\((.+)\)$/.exec(s.trim());
  return m ? { name: m[1]!, note: m[2]!.trim() } : { name: s.trim() };
}
