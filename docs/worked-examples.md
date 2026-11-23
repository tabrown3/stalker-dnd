# Worked Attack Examples (for the rules author to check)

These are 11 attacks worked out step by step using the rules as I currently
understand them. **Please mark each one correct or write what the right answer
should be.** Every example you approve becomes an automated test for the app, so
mistakes caught here will not end up in the code.

The dice rolls are made up and given in advance, so the math can be checked
exactly. All weapon, ammo and armor numbers come from the "Rules & Function"
sheet.

---

## The rules these examples use

Rules you have already confirmed:

- **Target AC** is the AC of the target's highest-level armor piece: Base 10
  (no armor), II 11, IIIA 12, III 13, III+ 14, IV 15. Pieces don't stack.
- **AP** only applies when the gun is loaded with AP rounds. The amount is the
  weapon's `Rnd AP`. Against an armored target it lowers the target's AC, and
  it also adds that much damage to each round that hits.
- **Range modifier:** +2 within 5m (CQB), +0 beyond 5m, −3 beyond the weapon's
  range.
- **One to-hit roll per trigger pull.** Each pull gets one d20 roll, however
  many rounds it fires. A semi-auto weapon can pull the trigger up to 6 times
  a turn, and each pull is rolled separately (see Example 11).
- **The shooter picks how many rounds each pull fires.** The fire mode comes
  from that number: 1 round is a single shot (+1), 2–6 rounds is a burst (+0),
  7 or more is full auto (−1). GPMGs get −2 more when not mounted.
- **Which weapons can fire more than 1 round per pull** (provisional, until the
  sheet gets a fire-capability column): pistols, shotguns, DMRs and sniper
  rifles fire only single shots. All other weapons can also fire bursts and
  full auto.
- **Rounds that hit** = half of what the pull's roll beats the AC by, rounded
  down.
- **Damage for each round that hits:**
  1. Roll the ammo's dice.
  2. Compare the ammo's tier with the armor's level:
     - Ammo below the armor's level: halve, rounding up.
     - Same level: remove 25%, rounding the removed amount up.
     - Higher (including all Undefendable ammo): full damage.
  3. Reduce by the armor's Prot %.
  4. Add velocity, +4 for hollow-point, and the AP amount for AP rounds. Armor
     never reduces these.

My assumptions. **Please check these especially:**

- **A. No attacker bonuses:** the to-hit roll is d20 plus the modifiers above,
  with no ability or skill bonus.
- **B. Caps and limits:** the rounds that hit on a pull can't exceed the rounds
  that pull fired. The per-turn caps (30 for burst and full auto, 40 for LMGs)
  count every round fired that turn, across all pulls.
- **C. Barely beating AC:** if the roll beats the AC by only 1 (or ties it), half
  of that rounds down to 0, so no rounds hit.
- **D. Dice per round:** the damage dice are rolled again for every round that
  hits, and velocity is added to every round.
- **E. Which Prot:** bullets use the **Phys Prot** column, from the same
  highest-level piece that sets AC.
- **F. Prot rounding:** the amount Prot removes rounds up, like the 25% rule.
- **G. Masks don't count:** masks have no armor level, so a target wearing only
  a mask counts as unarmored (AC 10, no Prot).
- **H. "Beyond range"** means beyond the weapon's **max** range (the second
  number).

---

## Example 1: Pistol vs. an unarmored target

**Setup:** Glock-17 (9x19mm, velocity 2), normal rounds, one trigger
pull of 1 round (single shot) at **3m**. The target wears no armor.

| Step | Work | Result |
|---|---|---|
| Target AC | No armor | **10** |
| To hit | d20 roll 15, +2 CQB (within 5m), +1 single shot | **18** |
| Rounds hit | Beats AC by 8 → half is 4, but the pull fired only 1 round | **1** |
| Dice | 1d20 rolls 12 | 12 |
| Armor | None | 12 |
| Extras | +2 velocity | **14** |

**Total: 14 damage.**

Correct? ☐ Yes ☐ No: _______________

---

## Example 2: Ammo below the armor's level (damage halved)

**Setup:** M9 (9x19mm, velocity 2), normal rounds, one trigger
pull of 1 round (single shot) at **20m**. The target wears a **PSZ-5D** (level
III, Phys Prot 46%).

| Step | Work | Result |
|---|---|---|
| Target AC | Level III | **13** |
| To hit | d20 roll 17, +0 range, +1 single shot | **18** |
| Rounds hit | Beats AC by 5 → half is 2, but the pull fired only 1 round | **1** |
| Dice | 1d20 rolls 15 | 15 |
| Tier | 9x19mm is tier II, below the armor's III → halve 15 = 7.5, round up | 8 |
| Prot | 46% of 8 = 3.68, round up to 4 removed | 4 |
| Extras | +2 velocity | **6** |

**Total: 6 damage.**

Correct? ☐ Yes ☐ No: _______________

---

## Example 3: Same tier as the armor (25% removed), burst

**Setup:** AK-74 (5.45x39mm, velocity 3, Rnd AP 4), **normal** rounds, one trigger
pull of **3 rounds** (a burst) at **150m**. The target wears a
**PSZ-5D** (level III, Phys Prot 46%).

| Step | Work | Result |
|---|---|---|
| Target AC | Level III. Normal rounds, so no AP | **13** |
| To hit | d20 roll 17, +0 range, +0 burst | **17** |
| Rounds hit | Beats AC by 4 → half is 2 | **2 of 3** |

5.45x39mm is tier III, the same as the armor, so 25% is removed from each round.

| Round | Dice (1d20 + 1d10) | Remove 25% (round up) | Prot 46% (round up) | +3 velocity |
|---|---|---|---|---|
| 1 | 14 + 6 = 20 | 20 − 5 = 15 | 15 − 7 = 8 | **11** |
| 2 | 8 + 3 = 11 | 11 − 3 = 8 | 8 − 4 = 4 | **7** |

**Total: 18 damage** (2 rounds hit, 1 missed).

Correct? ☐ Yes ☐ No: _______________

---

## Example 4: Same attack as Example 3, with AP rounds

**Setup:** identical to Example 3, but the AK-74 is loaded with **AP rounds**.
The dice rolls are the same, plus one more for the extra hit.

| Step | Work | Result |
|---|---|---|
| Target AC | 13, minus AP 4 (the AK-74's Rnd AP) | **9** |
| To hit | d20 roll 17, +0 range, +0 burst | **17** |
| Rounds hit | Beats AC by 8 → half is 4, but the pull fired only 3 | **3 of 3** |

| Round | Dice | Remove 25% | Prot 46% | +3 velocity, +4 AP |
|---|---|---|---|---|
| 1 | 14 + 6 = 20 | 15 | 8 | **15** |
| 2 | 8 + 3 = 11 | 8 | 4 | **11** |
| 3 | 2 + 1 = 3 | 3 − 1 = 2 | 2 − 1 = 1 | **8** |

**Total: 34 damage**, compared with 18 for normal rounds. AP rounds both land
more hits and add 4 damage to each one.

**Question:** the variants table lists the AP variant as "+4 AP". I have **not**
added that on top of the AK-74's own AP 4. Should AP rounds from an AK-74 have
AP 8 instead?

Correct? ☐ Yes ☐ No: _______________

---

## Example 5: Ammo above the armor's level (full damage)

**Setup:** SVD (7.62x54mmR, velocity 4), normal rounds, one trigger
pull of 1 round (single shot) at **600m**. The target wears a **Sunrise Suit**
(level IIIA, Phys Prot 40%).

| Step | Work | Result |
|---|---|---|
| Target AC | Level IIIA | **12** |
| To hit | d20 roll 16, +0 range (600m is within the SVD's range), +1 single shot | **17** |
| Rounds hit | Beats AC by 5 → half is 2, but the pull fired only 1 round | **1** |
| Dice | 3d20 rolls 14 + 9 + 17 | 40 |
| Tier | 7.62x54mmR is tier III+, above the armor's IIIA → full damage | 40 |
| Prot | 40% of 40 = 16 removed | 24 |
| Extras | +4 velocity | **28** |

**Total: 28 damage.**

Correct? ☐ Yes ☐ No: _______________

---

## Example 6: Beating AC by only 1

**Setup:** Fort-12 (9x18mm), normal rounds, one trigger pull of 1 round (single
shot) at **10m**. The target wears a **Wind of Freedom Suit** (level II).

| Step | Work | Result |
|---|---|---|
| Target AC | Level II | **11** |
| To hit | d20 roll 11, +0 range, +1 single shot | **12** |
| Rounds hit | Beats AC by 1 → half is 0.5, round down | **0** |

**Total: 0 damage.** The roll beat the AC, but no rounds hit (assumption C).

**Questions:**
- Is this right, or should beating the AC always land at least 1 round?
- What if the roll exactly equals the AC (12 vs. 12)?

Correct? ☐ Yes ☐ No: _______________

---

## Example 7: Shotgun with hollow-point vs. a target wearing only a mask

**Setup:** SPAS-12 (12x70mm, velocity 2), **hollow-point** rounds, one
trigger pull of 1 round (single shot) at **4m**. The target wears only a **GP-5
Gas Mask** (no armor level, Phys Prot 25%).

| Step | Work | Result |
|---|---|---|
| Target AC | A mask has no level, so the target counts as unarmored (assumption G) | **10** |
| To hit | d20 roll 10, +2 CQB, +1 single shot | **13** |
| Rounds hit | Beats AC by 3 → half is 1 | **1** |
| Dice | 4d20 rolls 11 + 5 + 18 + 7 | 41 |
| Armor | Counts as unarmored: no tier step, and the mask's Prot is ignored | 41 |
| Extras | +2 velocity, +4 hollow-point | **47** |

**Total: 47 damage.**

**Questions:**
- Should the mask's 25% Phys Prot reduce this damage, even though it gives no AC?
- Do shotguns have any special rules (pellets, spread, damage dropping off with
  range)?

Correct? ☐ Yes ☐ No: _______________

---

## Example 8: Undefendable ammo vs. the heaviest armor

**Setup:** RSh-12 (12.7x55mm, velocity 1), normal rounds, one trigger
pull of 1 round (single shot) at **20m**. The target wears an **Exoskeleton** (level IV, Phys Prot 65%).

| Step | Work | Result |
|---|---|---|
| Target AC | Level IV | **15** |
| To hit | d20 roll 18, +0 range, +1 single shot | **19** |
| Rounds hit | Beats AC by 4 → half is 2, but the pull fired only 1 round | **1** |
| Dice | 4d20 rolls 13 + 16 + 4 + 10 | 43 |
| Tier | 12.7x55mm is Undefendable → full damage | 43 |
| Prot | 65% of 43 = 27.95, round up to 28 removed | 15 |
| Extras | +1 velocity | **16** |

**Total: 16 damage.**

**Question:** does "Undefendable" mean only that the tier step is skipped (as
here), or does Prot % also not apply, which would make this 44 damage?

Correct? ☐ Yes ☐ No: _______________

---

## Example 9: Unmounted GPMG on full auto, beyond range

**Setup:** PKM (GPMG, 7.62x54mmR, velocity 5, range 500m/800m), normal rounds,
**not mounted**, one trigger pull of **30 rounds** (full auto) at **900m**. The target wears a
**Recruit Suit** (level II, Phys Prot 24%).

| Step | Work | Result |
|---|---|---|
| Target AC | Level II | **11** |
| To hit | d20 roll 20, −3 beyond range (900m is past the 800m max), −1 full auto, −2 unmounted GPMG | **14** |
| Rounds hit | Beats AC by 3 → half is 1 | **1 of 30** |
| Dice | 3d20 rolls 9 + 12 + 15 | 36 |
| Tier | 7.62x54mmR is tier III+, above the armor's II → full damage | 36 |
| Prot | 24% of 36 = 8.64, round up to 9 removed | 27 |
| Extras | +5 velocity | **32** |

**Total: 32 damage.** The other 29 rounds miss and count toward suppression.

**Questions:**
- Does a natural 20 do anything special (automatic hit, critical damage)?
- Are all 29 missed rounds "guaranteed to miss" for suppression, and what does
  suppression do to this target?
- Does the PKM share the LMG's 40-round cap, or is it limited to 30 on full
  auto, as used here?

Correct? ☐ Yes ☐ No: _______________

---

## Example 10: AP rounds vs. several armor pieces, ammo below the armor's level

**Setup:** HK416A5 (5.56x45mm, velocity 3, Rnd AP 4), **AP rounds**, one trigger
pull of **10 rounds** (full auto) at **200m**. The target wears **PSZ-9D Duty Armor** (level IV, Phys
Prot 70%), a **Sphere M20 Helmet** (level IIIA) and a **GP-5 Gas Mask**.

| Step | Work | Result |
|---|---|---|
| Target AC | The highest piece is the PSZ-9D (IV) = 15, minus AP 4 | **11** |
| To hit | d20 roll 17, +0 range, −1 full auto | **16** |
| Rounds hit | Beats AC by 5 → half is 2 | **2 of 10** |

5.56x45mm is tier III, below the armor's IV, so dice damage is halved. The AP
damage is added afterward and is not halved.

| Round | Dice (2d20) | Halve (round up) | Prot 70% (round up) | +3 velocity, +4 AP |
|---|---|---|---|---|
| 1 | 13 + 9 = 22 | 11 | 11 − 8 = 3 | **10** |
| 2 | 6 + 15 = 21 | 11 | 11 − 8 = 3 | **10** |

**Total: 20 damage.**

**Questions:**
- The helmet and mask add nothing here (assumption E). Should they, for
  example through hit location or by adding their Prot?
- Without AP rounds, the AC is 15, the roll beats it by only 1, and **no** rounds
  hit. Is that the intended gap between normal and AP rounds?

Correct? ☐ Yes ☐ No: _______________

---

## Example 11: Several trigger pulls in one turn

**Setup:** Glock-17 (9x19mm, velocity 2), normal rounds, at **15m**. The shooter
pulls the trigger **3 times** this turn, 1 round each (a semi-auto weapon may
pull up to 6 times a turn). The target wears a **Sunrise Suit** (level IIIA,
Phys Prot 40%), so AC is **12**. Each pull gets its own to-hit roll.

| Pull | To hit (d20 + 1 single shot) | Rounds hit | Dice (1d20) | Halve (9x19mm is below IIIA) | Prot 40% (round up) | +2 velocity |
|---|---|---|---|---|---|---|
| 1 | 16 + 1 = 17, beats 12 by 5 | 1 | 18 | 9 | 9 − 4 = 5 | **7** |
| 2 | 9 + 1 = 10, misses | 0 | | | | **0** |
| 3 | 19 + 1 = 20, beats 12 by 8 | 1 | 7 | 4 | 4 − 2 = 2 | **4** |

**Total: 11 damage** for the turn (2 of 3 pulls hit).

If the shooter had fired the same 3 rounds with **one** pull instead, that would
be a burst: a single roll at +0 instead of three rolls at +1.

**Question:** can a shooter mix pulls in one turn, for example a 3-round burst
followed by two single shots, as long as the turn's total stays under the cap?

Correct? ☐ Yes ☐ No: _______________

---

## Anything else?

Space for anything these examples got wrong or didn't cover:

_______________
