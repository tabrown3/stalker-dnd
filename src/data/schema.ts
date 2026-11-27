// Shapes of the generated game data. The converter's output is checked against
// these before anything is written, and the rules engine will use the types.
import { z } from "zod";

/** Armor levels, lowest to highest. */
export const ARMOR_LEVELS = ["II", "IIIA", "III", "III+", "IV"] as const;
export const ArmorLevel = z.enum(ARMOR_LEVELS);
/** An ammo tier is an armor level, or Undefendable (above every level). */
export const AmmoTier = z.enum([...ARMOR_LEVELS, "Undefendable"]);

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase-kebab id");
const nonNegInt = z.number().int().nonnegative();
const percent = z.number().int().min(0).max(100);

export const Dice = z.object({ count: z.number().int().positive(), sides: z.number().int().positive() });

export const Range = z.object({
  effectiveM: nonNegInt,
  maxM: nonNegInt,
  /** Free text the sheet attaches, e.g. "200m w/ stock" for the Stechkin. */
  note: z.string().optional(),
});

export const Stowage = z.object({
  extendedMm: z.number().positive().nullable(),
  collapsedMm: z.number().positive().nullable(),
});

export const Weapon = z.object({
  id,
  name: z.string(),
  ammoId: id,
  class: z.string(),
  valueTk: nonNegInt,
  /** Flat damage added to each round after the armor steps. */
  velocity: nonNegInt,
  /** As written on the weapon row; should match the ammo row. */
  damage: z.array(Dice).min(1),
  /** Rnd AP: used only with AP rounds. Lowers armored targets' AC; added to damage. */
  ap: nonNegInt,
  range: Range,
  weightKg: z.number().positive(),
  stowage: Stowage,
});

export const Ammo = z.object({
  id,
  name: z.string(),
  damage: z.array(Dice).min(1),
  ap: nonNegInt,
  valueTk: nonNegInt,
  /** Column the caliber sits under in the ammo-to-armor tier grid. */
  tier: AmmoTier,
});

export const AmmoVariant = z.object({
  id,
  name: z.string(),
  /** The sheet's "PLUS" columns, as written. */
  plusDamage: nonNegInt,
  plusAp: nonNegInt,
  plusValueTk: nonNegInt,
});

export const Protection = z.object({
  phys: percent,
  rad: percent,
  psi: percent,
  chem: percent,
  elec: percent,
  thermal: percent,
});

export const Armor = z.object({
  id,
  name: z.string(),
  type: z.string(),
  /** null for pieces with no level (masks, the OZK suit). */
  level: ArmorLevel.nullable(),
  factionIds: z.array(id),
  valueTk: nonNegInt,
  /** Percentages. */
  prot: Protection,
});

export const FactionRef = z.object({ factionId: id, note: z.string().optional() });
/** A relationship list, or "classified" where the sheet hides it. */
export const RelationList = z.union([z.array(FactionRef), z.literal("classified")]);

export const Faction = z.object({
  id,
  name: z.string(),
  description: z.string(),
  nationality: z.string(),
  /** "MOB" column, likely main operating base. */
  base: z.string().nullable(),
  notableLocations: z.array(z.string()),
  leader: z.string().nullable(),
  abilityBonus: z.string(),
  skillBonus: z.string(),
  allies: RelationList,
  neutral: RelationList,
  enemies: RelationList,
});

export const Tables = z.object({
  /** Total AC by armor level; `base` is unarmored. */
  acByLevel: z.object({
    base: z.number().int(),
    II: z.number().int(),
    IIIA: z.number().int(),
    III: z.number().int(),
    "III+": z.number().int(),
    IV: z.number().int(),
  }),
  currency: z.object({ tkPerGp: z.number().positive() }),
  /** Rules text as written in the sheet, for display and reference. */
  sourceText: z.object({
    combatRules: z.array(z.string()),
    armorRules: z.string(),
    glossary: z.array(z.object({ term: z.string(), definition: z.string() })),
  }),
});

export const Dataset = z.object({
  weapons: z.array(Weapon),
  ammo: z.array(Ammo),
  ammoVariants: z.array(AmmoVariant),
  armor: z.array(Armor),
  factions: z.array(Faction),
  tables: Tables,
});

export type Dice = z.infer<typeof Dice>;
export type Range = z.infer<typeof Range>;
export type Stowage = z.infer<typeof Stowage>;
export type Weapon = z.infer<typeof Weapon>;
export type Ammo = z.infer<typeof Ammo>;
export type AmmoVariant = z.infer<typeof AmmoVariant>;
export type Armor = z.infer<typeof Armor>;
export type Faction = z.infer<typeof Faction>;
export type FactionRef = z.infer<typeof FactionRef>;
export type RelationList = z.infer<typeof RelationList>;
export type Tables = z.infer<typeof Tables>;
export type Dataset = z.infer<typeof Dataset>;
export type ArmorLevel = z.infer<typeof ArmorLevel>;
export type AmmoTier = z.infer<typeof AmmoTier>;
