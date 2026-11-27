/**
 * A problem found in the sheet. Errors stop the build (the data can't be
 * produced); warnings and info are reported but never change the data.
 */
export interface Issue {
  severity: "error" | "warning" | "info";
  /** Stable kebab-case kind, e.g. "ammo-mismatch"; tests and filters use it. */
  code: string;
  message: string;
  /** Spreadsheet reference such as "G61", when one cell is to blame. */
  cell?: string;
}
