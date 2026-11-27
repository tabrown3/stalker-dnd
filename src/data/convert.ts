// Converts the sheet grid into the game dataset. Normalization only (parsing
// units, splitting lists, assigning IDs); judging the values is validate.ts's job.
import type { Issue } from "./issues.ts";
import {
  ParseError,
  isNA,
  parseDice,
  parseInteger,
  parseQualified,
  parseRange,
  parseStowage,
  parseWeightKg,
  slug,
  splitList,
} from "./parse.ts";
import {
  AmmoTier,
  ArmorLevel,
  Dataset,
  type Ammo,
  type AmmoVariant,
  type Armor,
  type Faction,
  type RelationList,
  type Tables,
  type Weapon,
} from "./schema.ts";
import { type Block, type Grid, cellAt, cellRef, columnOf, findBlock, findCell } from "./sheet.ts";

/** Alternate faction names in the sheet, mapped to the faction's ID. */
export const FACTION_ALIASES: Record<string, string> = { mercs: "mercenaries" };

export interface ConvertResult {
  /** Undefined when any error-level issue occurred. */
  data?: Dataset;
  issues: Issue[];
}

class FieldError extends Error {
  readonly cell: string;
  constructor(message: string, cell: string) {
    super(message);
    this.cell = cell;
  }
}

export function convert(g: Grid): ConvertResult {
  const issues: Issue[] = [];
  const aliasUses = new Map<string, string[]>();

  /** Trimmed cell text; leading or trailing spaces are reported. */
  const text = (row: number, col: number): string => {
    const raw = cellAt(g, row, col);
    if (raw !== raw.trim()) {
      issues.push({
        severity: "warning",
        code: "whitespace",
        message: `Extra spaces around "${raw.trim()}"`,
        cell: cellRef(row, col),
      });
    }
    return raw.trim();
  };

  const field = <T>(row: number, col: number, fn: (s: string) => T): T => {
    const s = text(row, col);
    try {
      return fn(s);
    } catch (e) {
      if (e instanceof ParseError) throw new FieldError(e.message, cellRef(row, col));
      throw e;
    }
  };

  const factionId = (name: string, where: string): string => {
    const s = slug(name);
    const target = FACTION_ALIASES[s];
    if (target === undefined) return s;
    const uses = aliasUses.get(name) ?? [];
    uses.push(where);
    aliasUses.set(name, uses);
    return target;
  };

  /** Runs `build` for each data row until a blank name cell; failures become errors. */
  const rows = <T>(block: Block, firstRow: number, build: (row: number) => T, stop?: (row: number) => boolean): T[] => {
    const out: T[] = [];
    for (let r = firstRow; r < g.length && !stop?.(r); r++) {
      if (cellAt(g, r, block.startCol).trim() === "") break;
      try {
        out.push(build(r));
      } catch (e) {
        if (!(e instanceof FieldError)) throw e;
        const name = cellAt(g, r, block.startCol).trim();
        issues.push({ severity: "error", code: "unparseable", message: `${name}: ${e.message}`, cell: e.cell });
      }
    }
    return out;
  };

  // --- Ammo-to-armor tier grid and AC row ------------------------------------
  const grid = findCell(g, (t) => t === "Undefendable");
  if (!grid) throw new Error('Tier grid not found (no "Undefendable" cell)');
  const tierCols: { col: number; tier: string }[] = [];
  for (let c = grid.col; c < (g[grid.row]?.length ?? 0); c++) {
    const t = text(grid.row, c);
    if (t === "") break;
    tierCols.push({ col: c, tier: t });
  }
  const acLabel = findCell(g, (t) => t === "AC");
  if (!acLabel || acLabel.col !== grid.col - 1) throw new Error('AC row not found left of the tier grid');
  const tierOfCaliber = new Map<string, string>();
  for (let r = grid.row + 1; r < acLabel.row; r++) {
    for (const { col, tier } of tierCols) {
      const cal = text(r, col);
      if (cal !== "") tierOfCaliber.set(cal, tier);
    }
  }
  const acByLevel: Record<string, number> = {};
  for (const { col, tier } of tierCols) {
    const v = text(acLabel.row, col);
    if (v === "") continue;
    acByLevel[tier === "Base" ? "base" : tier] = parseInteger(v);
  }

  // --- Ammo and variants -------------------------------------------------------
  const ammoBlock = findBlock(g, ["Ammo", "Rnd DMG"]);
  const ac = (h: string) => columnOf(ammoBlock, h);
  const variantsRow = findCell(g, (t) => t === "Variants");
  const ammoStop = (r: number) => variantsRow !== undefined && r >= variantsRow.row;
  // The ammo table has a blank row under its header, so start at the first filled row.
  let ammoStart = 1;
  while (ammoStart < g.length && cellAt(g, ammoStart, ammoBlock.startCol).trim() === "") ammoStart++;
  const ammo: Ammo[] = rows(
    ammoBlock,
    ammoStart,
    (r) => {
      const name = text(r, ac("Ammo"));
      const tier = tierOfCaliber.get(name);
      if (tier === undefined) throw new FieldError(`caliber is missing from the tier grid`, cellRef(r, ac("Ammo")));
      const parsedTier = AmmoTier.safeParse(tier);
      if (!parsedTier.success) throw new FieldError(`unknown tier "${tier}"`, cellRef(r, ac("Ammo")));
      return {
        id: slug(name),
        name,
        damage: field(r, ac("Rnd DMG"), parseDice),
        ap: field(r, ac("Rnd AP"), parseInteger),
        valueTk: field(r, ac("Rnd Value"), parseInteger),
        tier: parsedTier.data,
      };
    },
    ammoStop,
  );
  const ammoVariants: AmmoVariant[] = variantsRow
    ? rows(ammoBlock, variantsRow.row + 1, (r) => {
        const name = text(r, ammoBlock.startCol);
        return {
          id: slug(name.replace(/\s*variant$/i, "")),
          name,
          plusDamage: field(r, ammoBlock.startCol + 1, parseInteger),
          plusAp: field(r, ammoBlock.startCol + 2, parseInteger),
          plusValueTk: field(r, ammoBlock.startCol + 3, parseInteger),
        };
      })
    : [];
  for (const cal of tierOfCaliber.keys()) {
    if (!ammo.some((a) => a.name === cal)) {
      issues.push({ severity: "warning", code: "tier-without-ammo", message: `Tier grid lists "${cal}", which has no ammo row` });
    }
  }

  // --- Weapons ---------------------------------------------------------------
  const wBlock = findBlock(g, ["Name", "Ammo Type"]);
  const wc = (h: string) => columnOf(wBlock, h);
  const weapons: Weapon[] = rows(wBlock, 1, (r) => {
    const name = text(r, wc("Name"));
    return {
      id: slug(name),
      name,
      ammoId: slug(text(r, wc("Ammo Type"))),
      class: text(r, wc("Class")),
      valueTk: field(r, wc("Value"), parseInteger),
      velocity: field(r, wc("Velocity"), parseInteger),
      damage: field(r, wc("Rnd DMG"), parseDice),
      ap: field(r, wc("Rnd AP"), parseInteger),
      range: field(r, wc("Range"), parseRange),
      weightKg: field(r, wc("Weight"), parseWeightKg),
      stowage: field(r, wc("Stowage"), parseStowage),
    };
  });

  // --- Armor -----------------------------------------------------------------
  const aBlock = findBlock(g, ["Name", "Type", "Level"]);
  const arc = (h: string) => columnOf(aBlock, h);
  const pct = (r: number, h: string) => field(r, arc(h), parseInteger);
  const armor: Armor[] = rows(aBlock, 1, (r) => {
    const name = text(r, arc("Name"));
    const level = field(r, arc("Level"), (s) => {
      if (isNA(s)) return null;
      const p = ArmorLevel.safeParse(s);
      if (!p.success) throw new ParseError(`unknown armor level "${s}"`);
      return p.data;
    });
    const factionText = text(r, arc("Faction"));
    return {
      id: slug(name),
      name,
      type: text(r, arc("Type")),
      level,
      factionIds: splitList(factionText.replace(/\s+and\s+/g, ", ")).map((f) => factionId(f, `${name} (armor)`)),
      valueTk: field(r, arc("Value"), parseInteger),
      prot: {
        phys: pct(r, "Phys"),
        rad: pct(r, "Rad"),
        psi: pct(r, "Psi"),
        chem: pct(r, "Chem"),
        elec: pct(r, "Elec"),
        thermal: pct(r, "Them"),
      },
    };
  });

  // --- Factions --------------------------------------------------------------
  const fBlock = findBlock(g, ["Name", "Description"]);
  const fc = (h: string) => columnOf(fBlock, h);
  const optional = (s: string) => (isNA(s) ? null : s);
  const factions: Faction[] = rows(fBlock, 1, (r) => {
    const name = text(r, fc("Name"));
    const relation = (h: string): RelationList => {
      const s = text(r, fc(h));
      if (/^\/\/\s*classified\s*\/\/$/i.test(s)) return "classified";
      return splitList(s).map((item) => {
        const q = parseQualified(item);
        const ref = { factionId: factionId(q.name, `${name} (${h.toLowerCase()})`) };
        return q.note ? { ...ref, note: q.note } : ref;
      });
    };
    return {
      id: factionId(name, `${name} (faction row)`),
      name,
      description: text(r, fc("Description")),
      nationality: text(r, fc("Nationality")),
      base: optional(text(r, fc("MOB"))),
      notableLocations: splitList(text(r, fc("Notable"))),
      leader: optional(text(r, fc("Leader"))),
      abilityBonus: text(r, fc("Ability")),
      skillBonus: text(r, fc("Skill")),
      allies: relation("Allies"),
      neutral: relation("Neutral"),
      enemies: relation("Enemies"),
    };
  });

  for (const [name, uses] of aliasUses) {
    issues.push({
      severity: "info",
      code: "faction-alias",
      message: `"${name}" is read as ${FACTION_ALIASES[slug(name)]} (${uses.length} uses: ${uses.join(", ")})`,
    });
  }

  // --- Rules text --------------------------------------------------------------
  const combatRules: string[] = [];
  for (let r = 1; r < g.length; r++) {
    const t = cellAt(g, r, wBlock.startCol).trim();
    // Rules sentences sit under the weapon table, with the rest of the row blank.
    if (t !== "" && wBlock.headers.every((_, i) => i === 0 || cellAt(g, r, wBlock.startCol + i).trim() === "")) {
      combatRules.push(t);
    }
  }
  const armorRulesCell = findCell(g, (t) => /^armor rules:/i.test(t));
  const glossary = ["Attack Roll", "DMG Roll"].flatMap((term) => {
    const at = findCell(g, (t) => t === term);
    return at ? [{ term, definition: text(at.row, at.col + 1) }] : [];
  });
  const gp = findCell(g, (t) => /^1\s*gp\s*=\s*\d+\s*TK$/i.test(t));
  const tables = {
    acByLevel,
    currency: { tkPerGp: gp ? Number(/(\d+)\s*TK/i.exec(text(gp.row, gp.col))![1]) : NaN },
    sourceText: {
      combatRules,
      armorRules: armorRulesCell ? text(armorRulesCell.row, armorRulesCell.col).replace(/^armor rules:\s*/i, "") : "",
      glossary,
    },
  } as Tables;

  if (issues.some((i) => i.severity === "error")) return { issues };

  const checked = Dataset.safeParse({ weapons, ammo, ammoVariants, armor, factions, tables });
  if (!checked.success) {
    for (const e of checked.error.issues) {
      issues.push({ severity: "error", code: "schema", message: `${e.path.join(".")}: ${e.message}` });
    }
    return { issues };
  }
  return { data: checked.data, issues };
}
