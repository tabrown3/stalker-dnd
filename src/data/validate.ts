// Checks the converted dataset for suspicious values. It only reports; it never
// changes data, because the rules author decides what is a mistake.
import type { Issue } from "./issues.ts";
import type { Dataset, Faction, RelationList } from "./schema.ts";
import { formatDice } from "./parse.ts";

type Prot = keyof Dataset["armor"][number]["prot"];
type Relation = "allies" | "neutral" | "enemies";
const RELATIONS: Relation[] = ["allies", "neutral", "enemies"];

/** A value this many times the column's next-highest value is flagged. */
export const OUTLIER_RATIO = 1.5;

export function validate(data: Dataset, opts: { hasFireModeColumn: boolean }): Issue[] {
  const issues: Issue[] = [];
  const warn = (code: string, message: string) => issues.push({ severity: "warning", code, message });
  const info = (code: string, message: string) => issues.push({ severity: "info", code, message });

  // Duplicate IDs within each table.
  for (const [table, items] of Object.entries({
    weapons: data.weapons,
    ammo: data.ammo,
    ammoVariants: data.ammoVariants,
    armor: data.armor,
    factions: data.factions,
  })) {
    const seen = new Set<string>();
    for (const { id } of items) {
      if (seen.has(id)) warn("duplicate-id", `${table}: "${id}" appears more than once`);
      seen.add(id);
    }
  }

  // Weapons against their ammo.
  const ammoById = new Map(data.ammo.map((a) => [a.id, a]));
  for (const w of data.weapons) {
    const a = ammoById.get(w.ammoId);
    if (!a) {
      warn("unknown-ammo", `${w.name} uses ammo "${w.ammoId}", which has no ammo row`);
      continue;
    }
    if (formatDice(w.damage) !== formatDice(a.damage)) {
      warn("ammo-mismatch", `${w.name} damage ${formatDice(w.damage)} differs from ${a.name} ammo ${formatDice(a.damage)}`);
    }
    if (w.ap !== a.ap) {
      warn("ammo-mismatch", `${w.name} Rnd AP ${w.ap} differs from ${a.name} ammo Rnd AP ${a.ap}`);
    }
  }

  // Ranges and stowage.
  for (const w of data.weapons) {
    if (w.range.effectiveM > w.range.maxM) {
      warn("range-order", `${w.name} effective range ${w.range.effectiveM}m exceeds max ${w.range.maxM}m`);
    }
    if (w.range.note) info("range-note", `${w.name} range has a note: "${w.range.note}"`);
    const { extendedMm: ext, collapsedMm: col } = w.stowage;
    if (ext !== null && col !== null && col > ext) {
      warn("stowage-order", `${w.name} collapsed length ${col}mm exceeds extended ${ext}mm`);
    }
  }
  if (!opts.hasFireModeColumn) {
    info("no-fire-modes", "Weapon table has no fire-capability column; fire modes come from weapon class for now");
  }

  // Armor protection outliers, per column.
  const protKeys = Object.keys(data.armor[0]?.prot ?? {}) as Prot[];
  for (const k of protKeys) {
    const sorted = [...data.armor].sort((a, b) => b.prot[k] - a.prot[k]);
    const [top, next] = sorted;
    if (top && next && next.prot[k] > 0 && top.prot[k] > OUTLIER_RATIO * next.prot[k]) {
      warn("prot-outlier", `${top.name} ${k} protection is ${top.prot[k]}%; the next highest is ${next.prot[k]}% (${next.name})`);
    }
  }

  // Faction references.
  const factionIds = new Set(data.factions.map((f) => f.id));
  const missing = new Map<string, string[]>();
  const noteMissing = (id: string, where: string) => {
    if (factionIds.has(id)) return;
    missing.set(id, [...(missing.get(id) ?? []), where]);
  };
  for (const a of data.armor) for (const id of a.factionIds) noteMissing(id, a.name);
  for (const f of data.factions) {
    for (const rel of RELATIONS) {
      const list = f[rel];
      if (list !== "classified") for (const r of list) noteMissing(r.factionId, `${f.name} ${rel}`);
    }
  }
  for (const [id, where] of missing) {
    warn("unknown-faction", `"${id}" has no faction row but is referenced ${where.length} times (${where.join(", ")})`);
  }

  // Relationships: each pair should agree in both directions.
  const relationTo = (f: Faction, otherId: string): Relation | undefined =>
    RELATIONS.find((rel) => {
      const list: RelationList = f[rel];
      return list !== "classified" && list.some((r) => r.factionId === otherId);
    });
  const factions = data.factions;
  for (let i = 0; i < factions.length; i++) {
    for (let j = i + 1; j < factions.length; j++) {
      const a = factions[i]!;
      const b = factions[j]!;
      const ab = relationTo(a, b.id);
      const ba = relationTo(b, a.id);
      if (ab && ba && ab !== ba) {
        warn("relation-asymmetric", `${a.name} lists ${b.name} as ${ab}; ${b.name} lists ${a.name} as ${ba}`);
      } else if (!ab !== !ba) {
        const [lister, silent, rel] = ab ? [a, b, ab] : [b, a, ba!];
        const hidden = RELATIONS.some((r) => silent[r] === "classified");
        issues.push({
          severity: hidden ? "info" : "warning",
          code: "relation-missing",
          message: `${lister.name} lists ${silent.name} as ${rel}; ${silent.name} doesn't list ${lister.name}${hidden ? " (it has a classified list)" : ""}`,
        });
      } else if (!ab && !ba) {
        warn("relation-missing", `${a.name} and ${b.name} don't list each other`);
      }
    }
  }

  return issues;
}
