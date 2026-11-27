// Reads the sheet's CSV export into a grid and locates its side-by-side tables
// by header text, so added or reordered columns don't break the converter.
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";

export type Grid = string[][];

export function readGrid(path: string): Grid {
  return parse(readFileSync(path, "utf8"), { relax_column_count: true, bom: true }) as Grid;
}

export const cellAt = (g: Grid, row: number, col: number): string => g[row]?.[col] ?? "";

/** Spreadsheet-style reference for messages, e.g. (0, 0) -> "A1". */
export function cellRef(row: number, col: number): string {
  let name = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return `${name}${row + 1}`;
}

/** A table whose header sits in the sheet's first row. */
export interface Block {
  startCol: number;
  headers: string[]; // trimmed header text, left to right
}

/**
 * Finds the block whose header row starts with `leading` (exact, trimmed) and
 * extends right until the first blank header cell.
 */
export function findBlock(g: Grid, leading: string[]): Block {
  const top = g[0] ?? [];
  for (let c = 0; c + leading.length <= top.length; c++) {
    if (leading.every((h, i) => (top[c + i] ?? "").trim() === h)) {
      const headers: string[] = [];
      for (let k = c; k < top.length && (top[k] ?? "").trim() !== ""; k++) {
        headers.push((top[k] ?? "").trim());
      }
      return { startCol: c, headers };
    }
  }
  throw new Error(`No table with headers starting "${leading.join(", ")}" in row 1`);
}

/** Column index of the header that starts with `prefix` (case-insensitive). */
export function columnOf(block: Block, prefix: string): number {
  const p = prefix.toLowerCase();
  const hits = block.headers.flatMap((h, i) => (h.toLowerCase().startsWith(p) ? [i] : []));
  if (hits.length !== 1) {
    throw new Error(`Expected one header starting "${prefix}", found ${hits.length}`);
  }
  return block.startCol + hits[0]!;
}

/** Whether any header starts with `prefix`. */
export const hasColumn = (block: Block, prefix: string): boolean =>
  block.headers.some((h) => h.toLowerCase().startsWith(prefix.toLowerCase()));

/** Finds the first cell whose trimmed text satisfies `test`, scanning row by row. */
export function findCell(g: Grid, test: (text: string) => boolean): { row: number; col: number } | undefined {
  for (let r = 0; r < g.length; r++) {
    const row = g[r]!;
    for (let c = 0; c < row.length; c++) {
      if (test((row[c] ?? "").trim())) return { row: r, col: c };
    }
  }
  return undefined;
}
