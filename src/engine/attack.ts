// Resolves one shooter's attacks against one target for a turn. Pure: all
// randomness comes from the injected roller, and every step is returned so the
// UI can show the working.
import {
  ARMOR_LEVELS,
  type Ammo,
  type AmmoTier,
  type AmmoVariant,
  type Armor,
  type ArmorLevel,
  type Dice,
  type Tables,
  type Weapon,
} from "../data/schema.ts";
import type { Roller } from "./dice.ts";
import { DEFAULT_SETTINGS, type RuleSettings } from "./settings.ts";

export class AttackError extends Error {}

export interface AttackInput {
  weapon: Weapon;
  /** Must be the weapon's caliber. */
  ammo: Ammo;
  /** An ammo variant ID ("ap", "hollow-point"), or null for normal rounds. */
  variantId: string | null;
  /** What the target wears: at most one head piece and one body piece. */
  targetArmor: Armor[];
  distanceM: number;
  /** Only matters for classes with an unmounted penalty (GPMGs). */
  mounted?: boolean;
  /** Rounds fired on each trigger pull this turn, in order. One to-hit roll per pull. */
  pulls: number[];
}

export interface RulesContext {
  tables: Pick<Tables, "acByLevel">;
  ammoVariants: AmmoVariant[];
  settings?: RuleSettings;
}

export type FireMode = "single" | "burst" | "auto";
export type TierStep = "unarmored" | "lower" | "equal" | "higher";
export type ArmorSlot = "head" | "body";

export interface RoundResult {
  dice: number[];
  diceTotal: number;
  tierStep: TierStep;
  afterTier: number;
  protRemoved: number;
  afterProt: number;
  velocity: number;
  hollowPoint: number;
  ap: number;
  damage: number;
}

export interface PullHit {
  roundsFired: number;
  fireMode: FireMode;
  fireModeMod: number;
  d20: number;
  toHit: number;
  margin: number;
  hit: boolean;
  roundsHit: number;
  /** Rounds that didn't hit; candidates for suppression (GUESS). */
  roundsMissed: number;
}

export interface PullResult extends PullHit {
  rounds: RoundResult[];
  damage: number;
}

/** Everything about the attack that doesn't depend on dice. */
export interface AttackSetup {
  /** Highest level among worn pieces; null if none has a level. */
  armorLevel: ArmorLevel | null;
  targetAc: number;
  /** AP applied to this attack (0 unless AP rounds). */
  ap: number;
  effectiveAc: number;
  /** Sum of the worn pieces' protection, in percent. Uncapped. */
  protPercent: number;
  rangeMod: number;
  unmountedMod: number;
  roundsFired: number;
  /** Turn limit on rounds fired for this weapon. */
  turnCap: number;
}

export interface TurnResult extends AttackSetup {
  pulls: PullResult[];
  roundsHit: number;
  roundsMissed: number;
  totalDamage: number;
}

const rank = (t: AmmoTier): number => (t === "Undefendable" ? ARMOR_LEVELS.length : ARMOR_LEVELS.indexOf(t));

export function canFireMultiple(weapon: Weapon, settings: RuleSettings = DEFAULT_SETTINGS): boolean {
  return !settings.fireMode.singleShotOnlyClasses.includes(weapon.class);
}

export function turnCap(weapon: Weapon, settings: RuleSettings = DEFAULT_SETTINGS): number {
  const caps = settings.turnCaps;
  if (!canFireMultiple(weapon, settings)) return caps.singleShot;
  return caps.lmgClasses.includes(weapon.class) ? caps.lmg : caps.automatic;
}

export function fireModeFor(rounds: number, settings: RuleSettings = DEFAULT_SETTINGS): { mode: FireMode; mod: number } {
  const f = settings.fireMode;
  if (rounds === 1) return { mode: "single", mod: f.singleMod };
  if (rounds <= f.burstMaxRounds) return { mode: "burst", mod: f.burstMod };
  return { mode: "auto", mod: f.autoMod };
}

export function rangeModFor(weapon: Weapon, distanceM: number, settings: RuleSettings = DEFAULT_SETTINGS): number {
  const r = settings.range;
  if (distanceM <= r.cqbM) return r.cqbMod;
  if (distanceM > weapon.range[r.beyondRangeUses]) return r.beyondRangeMod;
  return 0;
}

export function armorSlotOf(armor: Armor, settings: RuleSettings = DEFAULT_SETTINGS): ArmorSlot {
  if (settings.armorSlots.head.includes(armor.type)) return "head";
  if (settings.armorSlots.body.includes(armor.type)) return "body";
  throw new AttackError(`${armor.name}: armor type "${armor.type}" has no slot`);
}

export function unmountedApplies(weapon: Weapon, settings: RuleSettings = DEFAULT_SETTINGS): boolean {
  return settings.unmountedPenalty.classes.includes(weapon.class);
}

interface Prepared extends AttackSetup {
  s: RuleSettings;
  input: AttackInput;
  hollowPoint: number;
  apDamage: number;
}

function prepare(input: AttackInput, ctx: RulesContext): Prepared {
  const s = ctx.settings ?? DEFAULT_SETTINGS;
  const { weapon, ammo } = input;

  if (ammo.id !== weapon.ammoId) throw new AttackError(`${weapon.name} fires ${weapon.ammoId}, not ${ammo.id}`);
  const variant = input.variantId === null ? null : ctx.ammoVariants.find((v) => v.id === input.variantId);
  if (variant === undefined) throw new AttackError(`Unknown ammo variant "${input.variantId}"`);
  if (input.pulls.length === 0) throw new AttackError("No trigger pulls");
  if (input.pulls.some((n) => !Number.isInteger(n) || n < 1)) throw new AttackError("Each pull fires a whole number of rounds, at least 1");
  if (!canFireMultiple(weapon, s) && input.pulls.some((n) => n > 1)) {
    throw new AttackError(`${weapon.name} (${weapon.class}) fires 1 round per pull`);
  }
  const roundsFired = input.pulls.reduce((a, b) => a + b, 0);
  const cap = turnCap(weapon, s);
  if (roundsFired > cap) throw new AttackError(`${weapon.name} can fire at most ${cap} rounds a turn; ${roundsFired} requested`);
  if (!(input.distanceM >= 0)) throw new AttackError("Distance must be 0 or more");
  for (const slot of ["head", "body"] as const) {
    const worn = input.targetArmor.filter((a) => armorSlotOf(a, s) === slot);
    if (worn.length > 1) throw new AttackError(`Only one ${slot} piece can be worn: ${worn.map((a) => a.name).join(", ")}`);
  }

  const levels = input.targetArmor.flatMap((a) => (a.level ? [a.level] : []));
  const armorLevel = levels.length ? levels.reduce((hi, l) => (rank(l) > rank(hi) ? l : hi)) : null;
  const targetAc = armorLevel ? ctx.tables.acByLevel[armorLevel] : ctx.tables.acByLevel.base;
  // The AP variant's own "+AP" is not added; the weapon's Rnd AP is the amount (CONFIRMED).
  const ap = variant?.id === "ap" ? weapon.ap : 0;
  return {
    s,
    input,
    armorLevel,
    targetAc,
    ap,
    effectiveAc: armorLevel ? targetAc - ap : targetAc,
    protPercent: input.targetArmor.reduce((sum, a) => sum + a.prot[s.protColumn], 0),
    rangeMod: rangeModFor(weapon, input.distanceM, s),
    unmountedMod: unmountedApplies(weapon, s) && !input.mounted ? s.unmountedPenalty.mod : 0,
    roundsFired,
    turnCap: cap,
    hollowPoint: variant?.id === "hollow-point" ? variant.plusDamage : 0,
    apDamage: armorLevel || s.apDamageVsUnarmored ? ap : 0,
  };
}

function setupOf(p: Prepared): AttackSetup {
  const { armorLevel, targetAc, ap, effectiveAc, protPercent, rangeMod, unmountedMod, roundsFired, turnCap } = p;
  return { armorLevel, targetAc, ap, effectiveAc, protPercent, rangeMod, unmountedMod, roundsFired, turnCap };
}

function pullHit(p: Prepared, fired: number, d20: number): PullHit {
  const { mode, mod } = fireModeFor(fired, p.s);
  const toHit = d20 + p.rangeMod + mod + p.unmountedMod;
  const margin = toHit - p.effectiveAc;
  const hit = margin >= 0; // meet or beat, as in D&D (CONFIRMED)
  const roundsHit = hit ? Math.min(fired, Math.max(p.s.minRoundsOnHit, Math.floor(margin / 2))) : 0;
  return { roundsFired: fired, fireMode: mode, fireModeMod: mod, d20, toHit, margin, hit, roundsHit, roundsMissed: fired - roundsHit };
}

function roundDamage(p: Prepared, dice: number[]): RoundResult {
  const diceTotal = dice.reduce((a, b) => a + b, 0);
  const tier = p.input.ammo.tier;
  let tierStep: TierStep;
  let afterTier: number;
  if (!p.armorLevel) {
    tierStep = "unarmored";
    afterTier = diceTotal;
  } else if (rank(tier) < rank(p.armorLevel)) {
    tierStep = "lower";
    afterTier = Math.ceil(diceTotal / 2);
  } else if (rank(tier) === rank(p.armorLevel)) {
    tierStep = "equal";
    afterTier = diceTotal - Math.ceil(diceTotal / 4); // removed amount rounds up
  } else {
    tierStep = "higher";
    afterTier = diceTotal;
  }
  // Removed amount rounds up (GUESS, assumption F); never below 0 dice damage.
  const protRemoved = Math.min(afterTier, Math.ceil((afterTier * p.protPercent) / 100));
  const afterProt = afterTier - protRemoved;
  const velocity = p.input.weapon.velocity;
  const damage = afterProt + velocity + p.hollowPoint + p.apDamage;
  return { dice, diceTotal, tierStep, afterTier, protRemoved, afterProt, velocity, hollowPoint: p.hollowPoint, ap: p.apDamage, damage };
}

/** The damage dice rolled for each round that hits, in roll order. */
export const damageDiceOf = (ammo: Ammo): number[] => ammo.damage.flatMap((d: Dice) => Array<number>(d.count).fill(d.sides));

/** Checks the attack and returns the dice-independent setup. Throws AttackError if not allowed. */
export function checkAttack(input: AttackInput, ctx: RulesContext): AttackSetup {
  return setupOf(prepare(input, ctx));
}

/**
 * First step for entered dice: given each pull's d20, how many rounds hit.
 * The caller then collects damageDiceOf(ammo) for each hit round and calls
 * resolveTurn with the rolls in order (each pull's d20, then its damage dice).
 */
export function previewHits(input: AttackInput, d20s: number[], ctx: RulesContext): { setup: AttackSetup; pulls: PullHit[] } {
  const p = prepare(input, ctx);
  if (d20s.length !== input.pulls.length) throw new AttackError(`Need ${input.pulls.length} d20 rolls, got ${d20s.length}`);
  return { setup: setupOf(p), pulls: input.pulls.map((fired, i) => pullHit(p, fired, d20s[i]!)) };
}

export function resolveTurn(input: AttackInput, ctx: RulesContext & { roll: Roller }): TurnResult {
  const p = prepare(input, ctx);
  const sides = damageDiceOf(input.ammo);
  const pulls: PullResult[] = input.pulls.map((fired) => {
    const hit = pullHit(p, fired, ctx.roll(20));
    const rounds = Array.from({ length: hit.roundsHit }, () => roundDamage(p, sides.map((n) => ctx.roll(n))));
    return { ...hit, rounds, damage: rounds.reduce((a, r) => a + r.damage, 0) };
  });
  const roundsHit = pulls.reduce((a, x) => a + x.roundsHit, 0);
  return {
    ...setupOf(p),
    pulls,
    roundsHit,
    roundsMissed: p.roundsFired - roundsHit,
    totalDamage: pulls.reduce((a, x) => a + x.damage, 0),
  };
}
