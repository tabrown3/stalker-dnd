// Rules that aren't in the sheet. Every provisional rule and every guess lives
// here, labeled, so a ruling from the rules author is a one-line change.
// Status tags match STALKER_TTRPG_NOTES.md: CONFIRMED, PROVISIONAL (confirmed for
// now, expected to change), GUESS (not confirmed).

export interface RuleSettings {
  range: {
    /** PROVISIONAL: CQB range for every weapon (matches D&D). */
    cqbM: number;
    /** CONFIRMED: to-hit bonus at or inside CQB range. */
    cqbMod: number;
    /** CONFIRMED: to-hit modifier beyond the weapon's range. */
    beyondRangeMod: number;
    /** GUESS (assumption H): "beyond range" means past the max range, not the effective range. */
    beyondRangeUses: "maxM" | "effectiveM";
  };
  fireMode: {
    /** CONFIRMED: modifiers for 1 round, 2..burstMaxRounds, and more. */
    singleMod: number;
    burstMod: number;
    autoMod: number;
    burstMaxRounds: number;
    /**
     * PROVISIONAL until the sheet has a fire-capability column: classes that
     * fire 1 round per pull. Pistol, Shotgun, DMR and Sniper Rifle are
     * confirmed; Revolver and RL are a GUESS (the literal rule would let them
     * fire full auto).
     */
    singleShotOnlyClasses: string[];
  };
  /** CONFIRMED: to-hit modifier for these classes when not mounted. */
  unmountedPenalty: { classes: string[]; mod: number };
  turnCaps: {
    /** CONFIRMED: single-shot-only weapons get this many pulls (rounds) a turn. */
    singleShot: number;
    /** CONFIRMED: rounds a turn for burst and full-auto capable weapons. */
    automatic: number;
    /** CONFIRMED: rounds a turn for LMGs. Whether GPMGs share it is OPEN; they don't here. */
    lmg: number;
    lmgClasses: string[];
  };
  /** CONFIRMED (2026-11-27): a target wears at most one piece per slot. Values are armor types. */
  armorSlots: { head: string[]; body: string[] };
  /** CONFIRMED: a hit lands at least this many rounds. */
  minRoundsOnHit: number;
  /** GUESS: which protection column applies to bullets. */
  protColumn: "phys" | "rad" | "psi" | "chem" | "elec" | "thermal";
  /** OPEN: whether AP rounds add their AP damage against an unarmored target. */
  apDamageVsUnarmored: boolean;
}

export const DEFAULT_SETTINGS: RuleSettings = {
  range: { cqbM: 5, cqbMod: 2, beyondRangeMod: -3, beyondRangeUses: "maxM" },
  fireMode: {
    singleMod: 1,
    burstMod: 0,
    autoMod: -1,
    burstMaxRounds: 6,
    singleShotOnlyClasses: ["Pistol", "Shotgun", "DMR", "Sniper Rifle", "Revolver", "RL"],
  },
  unmountedPenalty: { classes: ["GPMG"], mod: -2 },
  turnCaps: { singleShot: 6, automatic: 30, lmg: 40, lmgClasses: ["LMG"] },
  armorSlots: {
    head: ["Mask", "Helmet"],
    body: ["Body Armor", "Full Body Armor", "Protective Suit", "Exoskeleton"],
  },
  minRoundsOnHit: 1,
  protColumn: "phys",
  apDamageVsUnarmored: true,
};
