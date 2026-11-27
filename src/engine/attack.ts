// Resolves one shooter's attacks against one target for a turn. Pure: all
// randomness comes from the injected roller, and every step is returned so the
// UI can show the working.
import { ARMOR_LEVELS, type Ammo, type AmmoTier, type AmmoVariant, type Armor, type ArmorLevel, type Tables, type Weapon } from "../data/schema.ts";
import type { Roller } from "./dice.ts";
import { DEFAULT_SETTINGS, type RuleSettings } from "./settings.ts";

export class AttackError extends Error {}

export interface AttackInput {
  weapon: Weapon;
  /** Must be the weapon's caliber. */
  ammo: Ammo;
  /** An ammo variant ID ("ap", "hollow-point"), or null for normal rounds. */
  variantId: string | null;
  /** Every piece the target wears. */
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
  roll: Roller;
}

export type FireMode = "single" | "burst" | "auto";
export type TierStep = "unarmored" | "lower" | "equal" | "higher";

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

export interface PullResult {
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
  rounds: RoundResult[];
  damage: number;
}

export interface TurnResult {
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
  pulls: PullResult[];
  roundsFired: number;
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

export function resolveTurn(input: AttackInput, ctx: RulesContext): TurnResult {
  const s = ctx.settings ?? DEFAULT_SETTINGS;
  const { weapon, ammo } = input;

  // --- Check the attack is allowed -------------------------------------------
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

  // --- Target ------------------------------------------------------------------
  const levels = input.targetArmor.flatMap((a) => (a.level ? [a.level] : []));
  const armorLevel = levels.length ? levels.reduce((hi, l) => (rank(l) > rank(hi) ? l : hi)) : null;
  const targetAc = armorLevel ? ctx.tables.acByLevel[armorLevel] : ctx.tables.acByLevel.base;
  const isAp = variant?.id === "ap";
  // The AP variant's own "+AP" is not added; the weapon's Rnd AP is the amount (CONFIRMED).
  const ap = isAp ? weapon.ap : 0;
  const effectiveAc = armorLevel ? targetAc - ap : targetAc;
  const protPercent = input.targetArmor.reduce((sum, a) => sum + a.prot[s.protColumn], 0);
  const hollowPoint = variant?.id === "hollow-point" ? variant.plusDamage : 0;
  const apDamage = armorLevel || s.apDamageVsUnarmored ? ap : 0;

  // --- Modifiers shared by every pull -------------------------------------------
  const rangeMod = rangeModFor(weapon, input.distanceM, s);
  const unmountedMod = s.unmountedPenalty.classes.includes(weapon.class) && !input.mounted ? s.unmountedPenalty.mod : 0;

  const resolveRound = (): RoundResult => {
    const dice = ammo.damage.flatMap((d) => Array.from({ length: d.count }, () => ctx.roll(d.sides)));
    const diceTotal = dice.reduce((a, b) => a + b, 0);
    let tierStep: TierStep;
    let afterTier: number;
    if (!armorLevel) {
      tierStep = "unarmored";
      afterTier = diceTotal;
    } else if (rank(ammo.tier) < rank(armorLevel)) {
      tierStep = "lower";
      afterTier = Math.ceil(diceTotal / 2);
    } else if (rank(ammo.tier) === rank(armorLevel)) {
      tierStep = "equal";
      afterTier = diceTotal - Math.ceil(diceTotal / 4); // removed amount rounds up
    } else {
      tierStep = "higher";
      afterTier = diceTotal;
    }
    // Removed amount rounds up (GUESS, assumption F); integer math avoids float error.
    const protRemoved = Math.min(afterTier, Math.ceil((afterTier * protPercent) / 100));
    const afterProt = afterTier - protRemoved;
    const damage = afterProt + weapon.velocity + hollowPoint + apDamage;
    return { dice, diceTotal, tierStep, afterTier, protRemoved, afterProt, velocity: weapon.velocity, hollowPoint, ap: apDamage, damage };
  };

  const pulls: PullResult[] = input.pulls.map((fired) => {
    const { mode, mod } = fireModeFor(fired, s);
    const d20 = ctx.roll(20);
    const toHit = d20 + rangeMod + mod + unmountedMod;
    const margin = toHit - effectiveAc;
    const hit = margin >= 0; // meet or beat, as in D&D (CONFIRMED)
    const roundsHit = hit ? Math.min(fired, Math.max(s.minRoundsOnHit, Math.floor(margin / 2))) : 0;
    const rounds = Array.from({ length: roundsHit }, resolveRound);
    return {
      roundsFired: fired,
      fireMode: mode,
      fireModeMod: mod,
      d20,
      toHit,
      margin,
      hit,
      roundsHit,
      roundsMissed: fired - roundsHit,
      rounds,
      damage: rounds.reduce((a, r) => a + r.damage, 0),
    };
  });

  const roundsHit = pulls.reduce((a, p) => a + p.roundsHit, 0);
  return {
    armorLevel,
    targetAc,
    ap,
    effectiveAc,
    protPercent,
    rangeMod,
    unmountedMod,
    pulls,
    roundsFired,
    roundsHit,
    roundsMissed: roundsFired - roundsHit,
    totalDamage: pulls.reduce((a, p) => a + p.damage, 0),
  };
}
