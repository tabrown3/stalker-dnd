# STALKER Tabletop Companion App: Notes and Interpretation

Working notes on a companion app for a friend's D&D-like tabletop adaptation of
*S.T.A.L.K.E.R. 2: Heart of Chornobyl*. This file records my reading of the
source material and the planning discussion so far. The data pipeline and the
attack engine are built (2026-11-27); the app is not.
The source is the Google Sheet "STALKER DND" (tab "Rules & Function", range
A1:AM79), owned by the rules author and shared view-only. The tables below were
first transcribed by hand from pasted CSV and checked cell by cell against a CSV
export on 2026-11-20. On 2026-11-21 the author revised the sheet (typo fixes, data
fixes, an AC-by-level row, and a new range rule), and this document was updated
to match the new export. That export is saved, unedited, at
`data/source/stalker-dnd-sheet.csv`. Remaining source typos that the tables
silently correct are listed in section 9.

Conventions in this document:

- **[CONFIRMED]**: stated by the user (the rules author is the user's friend).
- **[GUESS]**: my interpretation, not confirmed.
- **[OPEN]**: unanswered question; do not implement until resolved.

---

## 1. Project goal

- Cross-platform app (React Native, probably Expo) that removes bookkeeping and
  arithmetic from the game.
- **Priority #1 (the "big one"):** attack calculation. Given attacker, weapon,
  ammo, target, and armor, determine hit and damage, using a database of weapon,
  ammo, armor, and character stats.
- Later: inventory, character state, faction info, and so on. One thing at a time.

### Architectural recommendations (from the planning discussion)

- **Stack:** Expo with TypeScript. Web target is useful for easy table use
  without app-store distribution.
- **Rules engine as pure TypeScript with no UI imports**, so it is trivially
  unit-testable. Rules will change often, so tests protect against regressions.
- **Game data in JSON (or YAML), validated with Zod**, kept out of code, so the
  friend can edit stats without a code change.
- **Local-first storage.** In-memory plus bundled JSON for the calculator phase.
  `expo-sqlite` or MMKV once characters and inventory arrive. No backend until
  multi-device sync is a real request.
- **Return a full breakdown, not just a number**, so players can audit disputed
  results. For example: `d20 14 + 3 range - 1 full-auto = 16 vs AC 14 (-4 AP) -> margin 6 -> 3 rounds hit`.
- **Support physical dice:** the roll should be an input the app can either
  generate or accept.
- **Model modifiers as a list of labeled effects** (range, fire mode, cover,
  conditions) rather than hardcoding each.
- **IP caveat:** STALKER is someone else's IP. Keep this a private,
  non-commercial table tool and do not distribute it with game assets.

### Suggested phases

1. **Spec:** worked-example document with about 10 attacks and expected outcomes
   (these become the first test cases).
2. **Engine and data:** pure-TS calculator, JSON schemas, tests.
3. **Minimal UI:** pick attacker, weapon, ammo, target; show the result breakdown.
   Web first.
4. **Characters and inventory:** persistence and sheets.

### Data pipeline (built 2026-11-27)

`npm run data` converts `data/source/stalker-dnd-sheet.csv` into
`data/weapons.json`, `ammo.json` (calibers and variants), `armor.json`,
`factions.json` and `tables.json` (AC by level, currency, the sheet's rules
text), plus `data/validation-report.md`. Code is in `src/data/`; tests in
`test/` (`npm test`) also check the committed JSON matches a fresh run.

- Tables are found by header text, not column letters, so added columns
  (e.g. the planned fire-capability column) don't break it.
- Normalizations: dice lists (`1d20/1d10` becomes two dice), ranges in meters
  with an optional note (Stechkin), weight in kg, stowage in mm, trimmed text,
  `N/A` as null or empty, kebab-case IDs, "Mercs" read as `mercenaries`,
  `IPSF and Corps` split into two factions, `IPSF (usually)` kept as a note,
  `//CLASSIFIED//` kept as `"classified"`. Ammo tier and AC come from the grid.
- Any unreadable cell stops the build with its cell reference; nothing is
  written. Suspicious values are reported as warnings and never altered.
- Rules that aren't in the sheet (CQB 5m, fire-mode cutoffs, minimum one
  round, class-based fire capability) belong in the engine's settings, not here.

---

## 2. How the CSV is laid out

The export is several independent tables placed side by side, so each CSV row
mixes unrelated records. Column blocks, left to right:

| Block | Columns | Contents |
|---|---|---|
| Weapons | A–J (`Name` to `Stowage`) | 62 weapons (rows 2–63) |
| (spacer + notes) | K blank, L notes | Sex-based bonuses (L43:L48) and the D&D language list (L71:L79) |
| Ammo | M–P (`Ammo, Rnd DMG, Rnd AP, Rnd Value (TK)`) | 14 calibers (rows 3–16) plus 2 variants (rows 19–21) |
| Armor | Q–AA (`Name` to `Them Prot`) | 56 pieces (rows 2–57) |
| (spacer) | AB blank | |
| Factions | AC–AM (`Name` to `Enemies`) | 11 factions (rows 2–12) |

Rules and notes sit below and between the tables:

- **Combat rules** (section 3): column A, rows 65–70, under the weapon table.
- **Glossary:** "Attack Roll" / "DMG Roll" in O62 and O64, definitions in P.
- **Armor Rules paragraph:** N67.
- **Ammo-to-armor-tier grid** (section 6): R67:X71, under the armor columns.
  Column X is a "Base" (no armor) column with no calibers.
- **AC by armor level** (section 6): row 72, label "AC" in Q72, values in S72:X72.
- **`1gp = 10TK`:** N72. **DELTA language list:** M71:M79.

Header meaning, as annotated in the source:

- `Velocity (Added to DMG after roll)`: flat bonus added to damage after rolling.
- `Rnd DMG`: damage per round. `Rnd` means "per round" **[GUESS]**.
- `Rnd AP (Removed from target AC if target is armored)`: flat AC reduction.
- `Range`: `effective/max`. Stowage: `extended stock / collapsed stock`.
- `Value (TK)`: price in "TK". The meaning of TK is not stated.

---

## 3. Core combat rules

### Rules stated in the source, with the user's clarifications

1. **Attack roll:** "Roll to see if AC is beat." **DMG roll:** "Roll to see damage."
2. **AP [CONFIRMED 2026-11-21]:** the AP value comes from the **weapon** table's
   `Rnd AP` column (so the 9A91 uses 5), and it **only applies when the loaded
   ammo is the AP variant**. Normal and hollow-point rounds have no AP. Per the
   header, AP is removed from the target's AC if the target is armored; per the
   armor rules, AP rounds also add AP damage (see below).
3. **Range modifier (revised 2026-11-21):** "When in CQB Range +2 to hit, when
   beyond 100m it is +0, when beyond range completely -3, optics modify this."
   This replaces the old +2 / +0 / -1 rule that the user had confirmed.
   **[CONFIRMED, provisional]** CQB range is **5m** for every weapon for now (to
   match D&D), subject to change. Outside CQB the modifier is +0 until the target
   is beyond the weapon's range. So: **+2 at 5m or less, +0 beyond 5m, -3 beyond
   the weapon's range.**
   **[OPEN]** Does "beyond range completely" mean past max or past effective range
   (and is the effective-range number still used)? How do optics modify it?
4. **Fire mode:** single shot **+1**, burst **+0**, full auto **-1** to hit.
   **[CONFIRMED 2026-11-22]** The shooter chooses how many rounds to fire, and
   the fire mode follows from that number (1 round = single shot). It is not a
   separate choice. **[CONFIRMED 2026-11-22]** 1 round = single shot, 2–6 =
   burst, 7+ = full auto.
   **[CONFIRMED, provisional]** Fire capability by class until the sheet gets a
   capability column (see section 9, #13): Pistol, Shotgun, DMR and Sniper Rifle
   are single-shot only. Every other class can fire single, burst and full auto.
   **[GUESS]** Revolver (RSh-12) and RL (RPG-7V1, RPG-22) are also treated as
   single-shot only, since the literal rule would let them fire full auto.
5. **Rounds that hit [CONFIRMED]:** half the *remainder* (the amount by which the
   roll beats the AC), rounded down. In symbols: `roundsHit = floor((roll - effectiveAC) / 2)`.
   **[CONFIRMED 2026-11-22]** The to-hit roll is made **once per trigger pull**,
   not once per bullet. A burst or full-auto pull is one roll. A semi-auto
   weapon firing several single shots in a turn rolls once for each pull.
6. **GPMGs:** -2 to hit when not mounted. (Changed from "LMGs" on 2026-11-21, so
   it now applies to the PKM and no longer to the RPK-74/RPK-74M.)
7. **Rounds per turn:** semi-auto 6 max; burst and full auto 30 max; LMG 40 max.
   Read as: a semi-auto weapon gets up to 6 trigger pulls a turn. **[GUESS]**
   Caps count all rounds fired in the turn, across pulls. **[OPEN]** Can one
   turn mix pulls (e.g. a burst, then single shots)? Does the GPMG (PKM) also
   get the 40-round LMG cap?
8. **Suppression:** rounds guaranteed to miss provide suppression, causing all
   enemies except fanatics (Monolith) and tanks (Pseudo-Giant) to take cover or
   temporarily flee.
9. **Damage dice [CONFIRMED]:** a slash means "plus". `1d20/1d10` is a 1d20
   **and** a 1d10, added together. Rows without a slash (`2d20`, `3d20`) use
   multiple dice of one type.
10. **Armor percentage [CONFIRMED]:** the `Prot` columns are percentages.

### Armor rules (verbatim from the source)

> If armor protects against an unequivalent ammo type the player takes half
> damage. AP variants do additional damage on top of that. If it takes damage from
> an equivalent ammo type, it removes 25% of that damage (if uneven it rounds up).
> Armor protects against a percentage of damage. Additionally, it increases AC
> depending on level.

Clarifications from the user (2026-11-21):

- **AC [CONFIRMED]:** the AC row (section 6) is the wearer's **total** AC:
  Base 10 (unarmored), II 11, IIIA 12, III 13, III+ 14, IV 15.
- **Multiple pieces [CONFIRMED, provisional]:** for now, the wearer's AC is the AC
  of their highest-level armor piece. AC does not stack.
- **Ammo tier [CONFIRMED]:** each caliber's tier is the column it sits under in the
  tier grid (section 6), and it is compared with the armor's level.
  - **Lower-tier ammo** than the armor: dice damage is **halved, rounded up**.
  - **Same-tier ("equivalent") ammo:** the armor removes 25% of the dice damage,
    rounding the removed amount up (from the source).
  - **Higher-tier ammo** than the armor, including all Undefendable ammo: **full**
    dice damage.
- **Prot % [CONFIRMED]:** applied **after** the halving or 25% step.
- **Added after armor [CONFIRMED]:** velocity, hollow-point +4, and AP damage
  (AP rounds only) are added after the armor steps, so armor never reduces them.
- **AP damage [CONFIRMED]:** the amount is the weapon's `Rnd AP`. It is not
  halved.

Still unresolved:

- **Prot stacking [CONFIRMED 2026-11-26/27]:** the `Prot` of every worn piece,
  masks included, is **added together** with **no cap** for now (e.g. body armor
  46% + helmet 50% = 96%). Above 100% all dice damage is removed (dice damage
  never goes below 0); velocity, hollow-point and AP damage still apply.
  **[GUESS]** Bullets use the `Phys Prot` column. **[OPEN]** Rounding for the Prot reduction; this document assumes the
  removed amount rounds up, like the 25% rule.
- **AP variant `+AP 4` [CONFIRMED 2026-11-27]:** it does **not** add to the
  weapon's `Rnd AP`. AP rounds use the weapon's `Rnd AP` alone (AK-74 AP = 4).
- **[OPEN]** Do AP rounds add AP damage against an unarmored target? (The AC
  reduction applies only to armored targets.)
- **[GUESS]** The armor level compared against ammo tier is the same
  highest-level piece used for AC. Masks and the OZK suit have no level, so a
  target wearing only those counts as unarmored.

### Draft attack pipeline (mostly confirmed; remaining guesses marked)

```
1. armorLevel  = highest level among worn pieces, or none (unarmored)     # [CONFIRMED, provisional]
2. targetAC    = AC_BY_LEVEL[armorLevel], or 10 if unarmored               # [CONFIRMED]
3. ap          = weapon.RndAP if ammo is AP variant, else 0                # [CONFIRMED]; variant +4 not added [CONFIRMED]
4. effectiveAC = targetAC - ap   (only if armored)
5. rangeMod    = +2 if <= 5m, -3 if beyond weapon range, else +0           # [CONFIRMED, provisional]
   For each trigger pull (one d20 per pull)                                # [CONFIRMED]
5a.  roundsFired = chosen by the shooter for this pull                     # [CONFIRMED]
5b.  fireModeMod = +1 if roundsFired == 1, +0 if 2-6, -1 if 7+             # [CONFIRMED]
     (roundsFired > 1 only if the weapon can burst / full auto)            # by class [CONFIRMED, provisional]
6.   toHit       = d20 + rangeMod + fireModeMod + gpmgPenalty             # no character mods yet [CONFIRMED 2026-11-26]
7.   hit         = toHit >= effectiveAC   (D&D: meet or beat)              # [CONFIRMED 2026-11-26]; no crits for now
     margin      = toHit - effectiveAC
8.   roundsHit   = hit ? clamp(floor(margin / 2), 1, roundsFired) : 0     # min 1 on a hit [CONFIRMED 2026-11-27]
     For each round that hits (dice and velocity per round [CONFIRMED 2026-11-26]):
9.     dice      = roll(ammo dice)
10.    tier step = compare ammo tier with armorLevel (skip if unarmored): # [CONFIRMED]
                     lower  -> ceil(dice / 2)
                     equal  -> dice - ceil(dice * 0.25)
                     higher -> dice   (all Undefendable ammo)
11.    Prot step = max(0, afterTier - ceil(afterTier * sumPhysProt / 100)) # order, sum, no cap [CONFIRMED]; column, rounding [GUESS]
12.    round dmg = afterProt + weapon.velocity + (hollow-point ? 4 : 0) + ap # [CONFIRMED]; ap vs unarmored [OPEN]
13. total      = sum over every round that hit, across all pulls this turn
14. suppression = rounds fired that could not hit                          # [GUESS]
```

### Open questions on the pipeline [OPEN]

Decided 2026-11-26:

- **Character modifiers:** none for now; to be added later.
- **Tie with AC:** use the D&D rule, so meeting the AC is a hit (`toHit >= AC`).
- **Dice and velocity:** rolled and added per round.
- **Minimum rounds (2026-11-27):** a hit always lands at least one round, so a
  tie or a margin of 1 hits for 1 round.
- **Crits:** none for now (natural 1 and 20 are ordinary rolls).
- **Multiple pieces:** `Prot` adds across all worn pieces, masks included, with
  no cap. AC still comes from the highest-level piece.

Still open:

- Is `roundsHit` capped at the rounds fired on that pull? (Assumed yes.)
- Is there hit location?

Deferred by the user (2026-11-27), to be designed later:

- Armor condition degradation.
- Hit location (torso vs. other body parts), which may change how Prot and AC
  apply per piece.
- A cap on summed `Prot`.
- Which rounds count as "guaranteed to miss" for suppression? (My guess: rounds
  fired in excess of `roundsHit`, or all rounds on a miss.)
- Rad, Psi, Chem, Elec, and Thermal protection are presumably for hazards,
  anomalies, and creatures. Where do they get used? Out of scope for now.

---

## 4. Ammo

Damage written with `+` (source uses `/`). Value is per round, in TK.

| Ammo | Rnd DMG | Rnd AP | Rnd Value (TK) |
|---|---|---|---|
| 5.45x39mm | 1d20+1d10 | 4 | 23 |
| 5.56x45mm | 2d20 | 4 | 33 |
| 7.62x51mm | 3d20 | 7 | 106 |
| 7.62x54mmR | 3d20 | 9 | 115 |
| 12.7x55mm | 4d20 | 12 | 150 |
| 9x19mm | 1d20 | 2 | 12 |
| 9x18mm | 1d20 | 1 | 4 |
| .45 ACP | 1d20+1d6 | 3 | 19 |
| 7.62x39mm | 2d20+1d6 | 5 | 65 |
| 9x39mm | 2d20+1d8 | 6 | 56 |
| 12x70mm | 4d20 | 3 | 52 |
| 6.8x51mm | 2d20+1d10 | 6 | 115 |
| PG-7VL (RPG-7 grenade) | 10d20 | 20 | 3125 |
| 72.5mm Rocket (RPG-22) | 8d20 | 20 | 2500 |

### Variants (header in source: "Variants / PLUS / PLUS / PLUS")

A round is normal, AP, or hollow-point. **[CONFIRMED]** AP rounds enable the
weapon's `Rnd AP` (section 3); hollow-point adds +4 damage after armor.
**[CONFIRMED 2026-11-27]** The AP variant's `+AP 4` does not add to the
weapon's `Rnd AP`; the weapon's value is used alone.

| Variant | +DMG | +AP | +Value (TK) |
|---|---|---|---|
| AP Variant | 0 | 4 | 4 |
| Hollow-Point Variant | 4 | 0 | 2 |

**[OPEN]** Does a variant apply to every caliber, including rockets? Is the +DMG
per round?

---

## 5. Weapons

`Dmg` and `AP` columns appear to be copied from the ammo table, so they should be
derivable. The validator should assert consistency (see section 9).
Range is `effective / max`. Stowage is `extended / collapsed`.

| # | Name | Ammo | Class | Value | Vel | Dmg | AP | Range | Weight | Stowage |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | AK-74 | 5.45x39mm | Assault Rifle | 10000 | 3 | 1d20+1d10 | 4 | 500m/800m | 3.07 kg | 943mm / N/A |
| 2 | AK-74M | 5.45x39mm | Assault Rifle | 10000 | 3 | 1d20+1d10 | 4 | 500m/800m | 3.40 kg | 943mm / 700mm |
| 3 | AKS-74 | 5.45x39mm | Assault Rifle | 10000 | 3 | 1d20+1d10 | 4 | 500m/800m | 2.97 kg | 943mm / 690mm |
| 4 | AKS-74U | 5.45x39mm | Carbine | 6500 | 2 | 1d20+1d10 | 4 | 400m/600m | 2.70 kg | 730mm / 490mm |
| 5 | HK416A5 | 5.56x45mm | Assault Rifle | 14000 | 3 | 2d20 | 4 | 600m/800m | 2.95 kg | 810mm / 720mm |
| 6 | HK417A2 | 7.62x51mm | DMR | 28000 | 4 | 3d20 | 7 | 600m/1,000m | 4.23 kg | 915mm / 670mm |
| 7 | HK433 | 5.56x45mm | Assault Rifle | 18000 | 3 | 2d20 | 4 | 600m/800m | 3.35 kg | 930mm / 670mm |
| 8 | G36K | 5.56x45mm | Assault Rifle | 18000 | 3 | 2d20 | 4 | 600m/800m | 3.30 kg | 860mm / 615mm |
| 9 | G3A3 | 7.62x51mm | Battle Rifle | 24000 | 4 | 3d20 | 7 | 600m/800m | 4.38 kg | 1025mm / N/A |
| 10 | PSG-1 | 7.62x51mm | DMR | 32000 | 4 | 3d20 | 7 | 800m/1,000m | 7.20 kg | 1230mm / N/A |
| 11 | Groza-14 | 9x39mm | Carbine | 17500 | 1 | 2d20+1d8 | 6 | 200m/300m | 2.70 kg | 700mm / 500mm |
| 12 | AS-VAL | 9x39mm | Assault Rifle | 26000 | 2 | 2d20+1d8 | 6 | 200m/400m | 2.50 kg | 875mm / 650mm |
| 13 | VSS | 9x39mm | DMR | 25000 | 2 | 2d20+1d8 | 6 | 200m/400m | 2.60 kg | 894mm / N/A |
| 14 | SVD | 7.62x54mmR | DMR | 26000 | 4 | 3d20 | 9 | 800m/1,300m | 4.30 kg | 1225mm / N/A |
| 15 | PKM | 7.62x54mmR | GPMG | 45900 | 5 | 3d20 | 9 | 500m/800m | 7.50 kg | 1173mm / N/A |
| 16 | RPK-74 | 5.45x39mm | LMG | 16000 | 4 | 1d20+1d10 | 4 | 600m/800m | 4.70 kg | 1060mm / N/A |
| 17 | RPK-74M | 5.45x39mm | LMG | 16000 | 4 | 1d20+1d10 | 4 | 600m/800m | 5.15 kg | 1060mm / 845mm |
| 18 | RPG-7V1 | PG-7VL | RL | 53125 | 0 | 10d20 | 20 | 300m/500m | 6.30 kg | 950mm / 630mm |
| 19 | Abakan | 5.45x39mm | Assault Rifle | 14500 | 3 | 1d20+1d10 | 4 | 400m/800m | 3.85 kg | 943mm / 728mm |
| 20 | Fort-221 | 5.45x39mm | Assault Rifle | 15000 | 3 | 1d20+1d10 | 4 | 400m/800m | 3.95 kg | 755mm / N/A |
| 21 | Malyuk | 5.45x39mm | Assault Rifle | 34000 | 3 | 1d20+1d10 | 4 | 500m/800m | 3.50 kg | 702mm / N/A |
| 22 | L85A2 | 5.56x45mm | Assault Rifle | 13500 | 3 | 2d20 | 4 | 400m/800m | 3.82 kg | 785mm / N/A |
| 23 | SG550 | 5.56x45mm | Assault Rifle | 16500 | 3 | 2d20 | 4 | 400m/800m | 4.10 kg | 1000mm / 772mm |
| 24 | SG552 | 5.56x45mm | Carbine | 15000 | 2 | 2d20 | 4 | 200m/500m | 3.20 kg | 730mm / 504mm |
| 25 | Carmel | 5.56x45mm | Assault Rifle | 28000 | 3 | 2d20 | 4 | 300m/600m | 3.68 kg | 946mm / 680mm |
| 26 | OTs-03 | 7.62x54mmR | DMR | 25000 | 4 | 3d20 | 9 | 800m/1,200m | 3.60 kg | 875mm / N/A |
| 27 | Three-Line Rifle | 7.62x54mmR | Sniper Rifle | 3500 | 6 | 3d20 | 9 | 400m/800m | 4.00 kg | 1232mm / N/A |
| 28 | AKM | 7.62x39mm | Assault Rifle | 11500 | 3 | 2d20+1d6 | 5 | 500m/800m | 3.30 kg | 880mm / N/A |
| 29 | SKS | 7.62x39mm | DMR | 9500 | 4 | 2d20+1d6 | 5 | 400m/600m | 3.85 kg | 1022mm / N/A |
| 30 | M1A | 7.62x51mm | Battle Rifle | 28000 | 4 | 3d20 | 7 | 400m/800m | 4.08 kg | 1128mm / N/A |
| 31 | R700 | 7.62x51mm | Sniper Rifle | 35530 | 6 | 3d20 | 7 | 600m/1,400m | 3.40 kg | 1118mm / 889mm |
| 32 | Fort-12 | 9x18mm | Pistol | 2200 | 2 | 1d20 | 1 | 25m/50m | 0.83 kg | 180mm / N/A |
| 33 | Fort-14TP | 9x18mm | Pistol | 2500 | 2 | 1d20 | 1 | 25m/50m | 0.94 kg | 205mm / N/A |
| 34 | Browning HP | 9x19mm | Pistol | 2800 | 2 | 1d20 | 2 | 25m/50m | 0.91 kg | 198mm / N/A |
| 35 | M1911 | .45 ACP | Pistol | 5500 | 1 | 1d20+1d6 | 3 | 25m/50m | 1.10 kg | 219mm / N/A |
| 36 | M9 | 9x19mm | Pistol | 3200 | 2 | 1d20 | 2 | 25m/50m | 0.95 kg | 217mm / N/A |
| 37 | RSh-12 | 12.7x55mm | Revolver | 10336 | 1 | 4d20 | 12 | 25m/100m | 2.20 kg | 357mm / N/A |
| 38 | Stechkin | 9x18mm | Machine Pistol | 14000 | 2 | 1d20 | 1 | 25m/50m (200m w/ stock) | 1.02 kg | 225mm / N/A |
| 39 | USP-45 | .45 ACP | Pistol | 6000 | 1 | 1d20+1d6 | 3 | 25m/50m | 0.79 kg | 200mm / N/A |
| 40 | Glock-17 | 9x19mm | Pistol | 3500 | 2 | 1d20 | 2 | 25m/50m | 0.63 kg | 204mm / N/A |
| 41 | RPG-22 | 72.5mm Rocket | RL | 22000 | 0 | 8d20 | 20 | 150m/200m | 2.80 kg | 850mm / 755mm |
| 42 | Spear | 6.8x51mm | Battle Rifle | 54000 | 2 | 2d20+1d10 | 6 | 700m/900m | 3.80 kg | 914mm / 685mm |
| 43 | Fort-230 | 9x19mm | SMG | 13500 | 2 | 1d20 | 2 | 50m/200m | 3.20 kg | 640mm / 410mm |
| 44 | MP5A2 | 9x19mm | SMG | 5500 | 2 | 1d20 | 2 | 25m/200m | 2.54 kg | 680mm / N/A |
| 45 | MP5A3 | 9x19mm | SMG | 5500 | 2 | 1d20 | 2 | 25m/200m | 3.08 kg | 700mm / 550mm |
| 46 | Vector-9 | 9x19mm | SMG | 17000 | 2 | 1d20 | 2 | 25m/150m | 2.70 kg | 617mm / 406mm |
| 47 | Bizon-2 | 9x19mm | SMG | 20600 | 2 | 1d20 | 2 | 50m/100m | 2.10 kg | 690mm / 460mm |
| 48 | MAC-10 | .45 ACP | Machine Pistol | 14000 | 1 | 1d20+1d6 | 3 | 50m/100m | 2.84 kg | 548mm / 295mm |
| 49 | Kiparis | 9x18mm | SMG | 4800 | 2 | 1d20 | 1 | 25m/100m | 1.57 kg | 590mm / 317mm |
| 50 | PMM | 9x18mm | Pistol | 1500 | 2 | 1d20 | 1 | 25m/50m | 0.76 kg | 165mm / N/A |
| 51 | TOZ-66 | 12x70mm | Shotgun | 2500 | 2 | 4d20 | 3 | 10m/35m | 3.20 kg | 1000mm / N/A |
| 52 | TOZ-34E | 12x70mm | Shotgun | 3000 | 2 | 4d20 | 3 | 35m/50m | 3.20 kg | 1150mm / N/A |
| 53 | SPAS-12 | 12x70mm | Shotgun | 11000 | 2 | 4d20 | 3 | 30m/50m | 4.40 kg | 1041mm / 710mm |
| 54 | M870 | 12x70mm | Shotgun | 8000 | 2 | 4d20 | 3 | 25m/50m | 3.40 kg | 970mm / 750mm |
| 55 | DP-12 | 12x70mm | Shotgun | 29000 | 2 | 4d20 | 3 | 25m/33m | 4.42 kg | 749mm / N/A |
| 56 | Saiga-12K | 12x70mm | Shotgun | 24000 | 2 | 4d20 | 3 | 35m/70m | 3.50 kg | 910mm / 670mm |
| 57 | Maverick | 12x70mm | Shotgun | 6500 | 2 | 4d20 | 3 | 25m/44m | 2.72 kg | 1003mm / 750mm |
| 58 | HK417A2 Assaulter | 7.62x51mm | Carbine | 30000 | 4 | 3d20 | 7 | 500m/800m | 4.00 kg | 885mm / 608mm |
| 59 | AEK-971 | 5.45x39mm | Assault Rifle | 13000 | 3 | 1d20+1d10 | 4 | 500m/800m | 3.30 kg | 960mm / 720mm |
| 60 | 9A91 | 9x39mm | SMG | 24000 | 1 | 2d20+1d8 | **5** | 200m/400m | 2.10 kg | 605mm / 383mm |
| 61 | ASh-12 | 12.7x55mm | Assault Rifle | 38000 | 1 | 4d20 | 12 | 100m/400m | 6.00 kg | 1020mm / N/A |
| 62 | AEK-973 | 7.62x39mm | Assault Rifle | 14000 | 3 | 2d20+1d6 | 5 | 500m/800m | 3.25 kg | 960mm / 720mm |

Sex-based character bonuses (found beside the weapon table, not tied to weapons):

- **Male characters:** Strength +1, Intimidation +1.
- **Female characters:** Dexterity +1, Perception +1.

---

## 6. Armor

### Armor levels and the ammo-to-tier grid

Levels, lowest to highest protection: **Base (no armor), II, IIIA, III, III+, IV,
Undefendable** (`Base` and `Undefendable` appear as grid columns, not as armor
levels). Pieces with level `N/A` (all nine masks and the OZK suit) have no level
and presumably leave AC unchanged **[GUESS]**.

The grid stacks calibers vertically under each level, with the sheet's AC row
beneath it. Reconstructed from the column positions (the source's order is
Undefendable, IV, III+, III, IIIA, II, Base; I have only reversed the columns):

| | Base | II | IIIA | III | III+ | IV | Undefendable |
|---|---|---|---|---|---|---|---|
| Calibers | | 9x19mm | .45 ACP | 5.45x39mm | 7.62x54mmR | 9x39mm | 12.7x55mm |
| | | 9x18mm | 12x70mm | 5.56x45mm | 7.62x51mm | 6.8x51mm | PG-7VL |
| | | | | 7.62x39mm | | | 72.5mm Rocket |
| **AC** | **10** | **11** | **12** | **13** | **14** | **15** | — |

Every caliber in the ammo table now appears exactly once. (Before 2026-11-21,
III+ listed 7.62x39mm a second time and 7.62x51mm was missing.)

**[CONFIRMED]** The grid gives each caliber's tier, which is compared with the
armor's level (lower tier: half damage; same tier: 25% removed; see section 3).
**[CONFIRMED]** The AC row is the wearer's total AC for that level. For now, a
wearer with several pieces uses the highest-level piece.

### Armor pieces

All `Prot` values are percentages **[CONFIRMED]**. `Faction` is who makes or
issues it. `Them` means Thermal. Columns: Phys, Rad, Psi, Chem, Elec, Them.

| Name | Type | Level | Faction | Value | Phys | Rad | Psi | Chem | Elec | Them |
|---|---|---|---|---|---|---|---|---|---|---|
| Aeroprotection Mask | Mask | N/A | Ward | 3200 | 20 | 10 | 15 | 9 | 9 | 13 |
| Aurora Gas Mask | Mask | N/A | N/A | 4500 | 20 | 5 | 10 | 19 | 20 | 18 |
| GP-5 Gas Mask | Mask | N/A | N/A | 1800 | 25 | 20 | 15 | 19 | 10 | 13 |
| GP-21 Gas Mask | Mask | N/A | N/A | 5200 | 35 | 15 | 5 | 20 | 14 | 14 |
| ShM-41 Gas Mask | Mask | N/A | N/A | 1500 | 25 | 20 | 16 | 19 | 10 | 15 |
| Optican Gas Mask | Mask | N/A | N/A | 4200 | 40 | 5 | 5 | 20 | 14 | 14 |
| PA-10 Gas Mask | Mask | N/A | N/A | 6800 | 44 | 13 | 13 | 19 | 20 | 18 |
| PA-7 Gas Mask | Mask | N/A | IPSF | 6000 | 50 | 13 | 20 | 17 | 22 | 18 |
| PG-4 Facehugger Gas Mask | Mask | N/A | Ward | 7500 | 40 | 6 | 7 | 22 | 19 | 15 |
| Sphere-08 Helmet | Helmet | IIIA | IPSF | 11000 | 50 | 16 | 15 | 13 | 13 | 13 |
| 6B47 Helmet | Helmet | II | N/A | 8500 | 45 | 16 | 15 | 10 | 12 | 14 |
| Sphere M20/Mask-1 Combo | Helmet | IIIA | IPSF | 18500 | 75 | 16 | 30 | 19 | 16 | 18 |
| Sphere M20 Helmet | Helmet | IIIA | IPSF | 14000 | 50 | 16 | 15 | 13 | 16 | 16 |
| Sphere-08/PA-7 Combo | Helmet | IIIA | IPSF | 16500 | 75 | 16 | 20 | 19 | 19 | 18 |
| Sphere M20/PA-7 Combo | Helmet | IIIA | Duty | 19500 | 75 | 16 | 20 | 19 | 16 | 18 |
| Rainfall Suit | Body Armor | IIIA | Loners | 8000 | 38 | 30 | 0 | 8 | 11 | 8 |
| Corax Suit | Body Armor | IIIA | Loners | 9500 | 38 | 30 | 0 | 8 | 11 | 9 |
| Marauder Suit | Body Armor | IIIA | Bandits | 7500 | 38 | 30 | 0 | 8 | 11 | 9 |
| Mercenary Suit | Body Armor | IIIA | Mercenaries | 12000 | 40 | 30 | 0 | 10 | 10 | 8 |
| Mercenary Light Suit | Body Armor | II | Mercenaries | 9500 | 40 | 30 | 0 | 10 | 10 | 8 |
| OZK Explorer's Suit | Body Armor | N/A | Loners | 6500 | 30 | 10 | 0 | 16 | 13 | 10 |
| PSZ-5D | Body Armor | III | Duty | 13500 | 46 | 30 | 0 | 13 | 13 | 11 |
| PSZ-5I | Body Armor | III | Spark | 14000 | 45 | 40 | 0 | 16 | 14 | 16 |
| PSZ-5V | Body Armor | III | Freedom | 13500 | 44 | 40 | 0 | 17 | 13 | 16 |
| PSZ-7 | Body Armor | III | IPSF | 24000 | 42 | 30 | 0 | 10 | 8 | 7 |
| PSZ-20W Convoy | Body Armor | III+ | Ward | 32000 | 50 | 40 | 0 | 14 | 14 | 12 |
| Recruit Suit | Body Armor | II | Duty | 5000 | 24 | 20 | 0 | 8 | 8 | 9 |
| Sunrise Suit | Body Armor | IIIA | Loners | 11000 | 40 | 30 | 0 | 13 | 11 | 13 |
| Wind of Freedom Suit | Body Armor | II | Freedom | 10500 | 22 | 20 | 0 | 10 | 10 | 11 |
| Zircon Suit | Body Armor | III | Monolith | 26000 | 48 | 40 | 0 | 13 | 13 | 11 |
| Berill-5M Armored Suit | Full Body Armor | III+ | IPSF and Corps | 22000 | 42 | 30 | 0 | 10 | 8 | 11 |
| Guardian of Freedom Suit | Full Body Armor | III+ | Freedom | 21000 | 45 | 30 | 0 | 10 | 7 | 14 |
| Corundum Suit | Full Body Armor | IV | N/A | 38000 | 70 | 50 | 20 | 16 | 17 | 20 |
| PSZ-12V Bulat | Full Body Armor | IV | Freedom | 34000 | 65 | 50 | 0 | 16 | 14 | 20 |
| PSZ-9D Duty Armor | Full Body Armor | IV | Duty | 30000 | 70 | 40 | 0 | 16 | 14 | 20 |
| PSZ-9I Falcon | Full Body Armor | IV | Spark | 33000 | 60 | 50 | 40 | 23 | 23 | 23 |
| PSZ-9N Wolfhound | Full Body Armor | IV | Mercenaries | 28000 | 60 | 40 | 0 | 16 | 16 | 20 |
| SEVA Suit | Protective Suit | IIIA | Loners | 36000 | 40 | 60 | 40 | 32 | 32 | 23 |
| SEVA-D Suit | Protective Suit | IIIA | Duty | 40000 | 50 | 50 | 30 | 27 | 28 | 21 |
| SEVA-I Suit | Protective Suit | IIIA | Spark | 42000 | 50 | 60 | 40 | 29 | 29 | 23 |
| SEVA-V Suit | Protective Suit | IIIA | Freedom | 38000 | 40 | 70 | 20 | 29 | 26 | 20 |
| SEVA-M Suit | Protective Suit | IIIA | Monolith | 37000 | 50 | 60 | 40 | 27 | 26 | 23 |
| SSP-99 Ecologist | Protective Suit | II | Malachite | 32000 | 20 | 60 | 25 | 36 | 30 | 23 |
| SSP-100 Discovery | Protective Suit | IIIA | Malachite | 46000 | 40 | 60 | 55 | 42 | 42 | 42 |
| SSP-100I Survey | Protective Suit | III | Spark | 44000 | 60 | 50 | 20 | 45 | 45 | 46 |
| SSP-100M SIRCAA | Protective Suit | III | SIRCAA | 45000 | 40 | 60 | 55 | 45 | 45 | **97** |
| Brummbar Exoskeleton | Exoskeleton | IV | Mercenaries | 68000 | 80 | 60 | 20 | 34 | 30 | 31 |
| Bulwark Exosuit | Exoskeleton | IV | Freedom | 62000 | 70 | 70 | 40 | 29 | 36 | 29 |
| Cuirass Exoskeleton | Exoskeleton | IV | Duty | 74000 | 80 | 60 | 20 | 36 | 32 | 33 |
| Diamond Exoskeleton | Exoskeleton | IV | Monolith | 82000 | 80 | 80 | 40 | 39 | 39 | 39 |
| Exoskeleton | Exoskeleton | IV | N/A | 60000 | 65 | 60 | 50 | 32 | 32 | 23 |
| Liberty Exoskeleton | Exoskeleton | IV | Freedom | 76000 | 80 | 80 | 40 | 32 | 36 | 36 |
| Operator Exoskeleton | Exoskeleton | IV | Ward | 70000 | 80 | 70 | 30 | 34 | 34 | 34 |
| PSZ-21W Shturm | Exoskeleton | IV | Ward | 65000 | 80 | 75 | 30 | 34 | 34 | 23 |
| Ruby Exoskeleton | Exoskeleton | IV | Monolith | 78000 | 75 | 80 | 20 | 26 | 36 | 26 |
| Shield of Duty Exoskeleton | Exoskeleton | IV | Duty | 75000 | 75 | 60 | 20 | 23 | 22 | 25 |

---

## 7. Factions

Eleven factions have rows. `MOB` is not defined; my **[GUESS]** is "main
operating base". Each faction also grants +1 to one ability and +1 to one skill
(`Ability Inc (+1)`, `Skill Inc (+1)`), presumably as a character-creation bonus
**[GUESS]**.

| Faction | Nationality | MOB | Notable locations | Leader | Ability +1 | Skill +1 |
|---|---|---|---|---|---|---|
| IPSF | Slavic primarily | The Sphere | Dam, Duga (until campaign) | Major Harmata | Charisma | Perception |
| Ward | Slavic primarily | Chemical Plant | SIRCAA, Duga (during campaign) | Colonel Korshunov | Constitution | Performance |
| Mercenaries | Westerners primarily | The Dead City | N/A | //UNKNOWN// | Strength | Athletics |
| Duty | Slavic primarily | The Concrete Plant | N/A | General Voronin | Constitution | Intimidation |
| Freedom | Slavic primarily | Rostok | N/A | Miklukha | Charisma | Persuasion |
| Corps | Exclusively Ukrainian | Enerhetyk | Yaniv Station | Colonel Degtyarev | Wisdom | Survival |
| Malachite | Slavic primarily | STC Malachite | N/A | Professor Ozersky | Intelligence | Nature |
| SIRCAA | International, Ukrainian-led | SIRCAA | N/A | Doctor Dalin | Intelligence | Arcana |
| Loners | Any | N/A | Zalissya, Rookie Village | N/A | Wisdom | Investigation |
| Bandits | Slavic primarily | N/A | Sultanks, Skadovsk, Slag Heap (neutral), The Plant | N/A | Charisma | Stealth |
| Spark | Slavic primarily | N/A | STC Malachite, Detention Center, Spark Bunker | Scar | Dexterity | History |

### Faction relationships (as written in the source)

| Faction | Allies | Neutral | Enemies |
|---|---|---|---|
| IPSF | Malachite, Corps | Ward, SIRCAA, Spark | Loners, Duty, Freedom, Noontide, Bandits, Mercs |
| Ward | SIRCAA | Loners, Duty, Malachite, IPSF | Spark, Noontide, Freedom, Bandits, Mercs, Corps |
| Mercenaries | //CLASSIFIED// | Bandits, Spark, Duty, Malachite, Freedom, Loners, Noontide | IPSF, Ward, SIRCAA |
| Duty | N/A | Loners, Malachite, Spark, Ward, SIRCAA, Noontide, Corps | IPSF, Bandits, Freedom, Mercs |
| Freedom | Spark | Loners, Mercs, Malachite, Ward, SIRCAA, Noontide, Corps | Duty, Bandits, IPSF |
| Corps | N/A | Duty, Freedom, Loners, IPSF, Noontide, Mercs, SIRCAA, Spark, Malachite | Bandits, Ward |
| Malachite | Spark, IPSF | Duty, Freedom, Loners, Noontide, Mercs, SIRCAA, Corps | Bandits, Ward |
| SIRCAA | Ward | Duty, Freedom, Loners, Noontide, Mercs, Corps, Malachite, IPSF | Spark, Bandits |
| Loners | N/A | Duty, Freedom, Noontide, Mercs, Corps, Malachite, Spark, Ward, SIRCAA | Bandits, IPSF (usually) |
| Bandits | N/A | Mercs | IPSF, Spark, Duty, Freedom, Loners, Ward, SIRCAA, Malachite, Corps, Noontide |
| Spark | Freedom, Malachite, Noontide | Duty, Corps, Loners, IPSF, Mercs | Ward, SIRCAA, Bandits |

One-line descriptions in the source (paraphrased): IPSF is an international
guard force with corrupt officers; Ward is a PMC protecting SIRCAA that drafted
the "D4 treaty"; Mercenaries are guns for hire with a possible hidden agenda;
Duty is militarized and dedicated to destroying the Zone (paused by D4); Freedom
wants the Zone to continue and people free to find their fate; Corps is the
Ukrainian MoD arm guarding Pripyat and the X labs; Malachite is the older
scientific community; SIRCAA is the favored younger scientific body; Loners are
the Zone's economy; Bandits are loosely connected rogues; Spark is a remnant of
Clear Sky at war with Ward.

---

## 8. Miscellany

- **Currency:** `1gp = 10TK` ("TK" undefined; all values in the tables are TK).
- **D&D languages:** Common, Draconic, Dwarvish, Elvish, Giant, Gnomish, Goblin,
  Halfling.
- **DELTA languages (setting-specific):** Ukrainian, Kazakh, Russian, English,
  French, German, Polish, Czech.
- **Glossary:** *Attack Roll* = roll to see if AC is beaten. *DMG Roll* = roll
  to see damage.

---

## 9. Data problems found (for the validator)

Status as of the 2026-11-21 export. Items the author fixed are kept, struck
through, so the history is visible.

1. ~~**Tier grid:** 7.62x39mm listed twice, 7.62x51mm missing.~~ **Fixed.**
2. **SSP-100M thermal protection is 97.** Neighbors are 42 to 46. Likely a typo.
   Still present.
3. ~~**7.62x51mm and 7.62x54mmR both cost 106 TK/round.**~~ **Fixed:** 7.62x54mmR
   is now 115.
4. **9A91 AP is 5,** but every other 9x39mm weapon (and the 9x39mm ammo row) has
   AP 6. Still present. Since AP now comes from the weapon table, this may be
   deliberate; worth confirming.
5. ~~**RSh-12 stowage** collapsed length larger than extended.~~ **Fixed:**
   collapsed is now N/A.
6. **Factions without rows:** Noontide (referenced in nearly every relationship
   list) and Monolith (referenced by armor and by the suppression rule). Still
   present.
7. **Relationships are not symmetric.** Two were fixed (Freedom now lists IPSF
   as an enemy; Ward now lists Corps as an enemy). Five remain:
   - IPSF lists Corps as an ally; Corps lists IPSF as neutral.
   - Duty lists Mercs as an enemy; Mercenaries list Duty as neutral.
   - Ward lists Freedom as an enemy; Freedom lists Ward as neutral.
   - Malachite lists Ward as an enemy; Ward lists Malachite as neutral.
   - Mercenaries list SIRCAA as an enemy; SIRCAA lists Mercs as neutral.

   **[OPEN]** Deliberate (directional reputation) or data errors?
8. **Naming inconsistencies and typos.** Fixed: "Freedon", "Internation",
   "Exclusivley", "Three-Line RIfle". Remaining: "Mercs" vs "Mercenaries";
   typos in the faction descriptions ("bringin", "brazon", "loose",
   "thoguht hey", a missing space in "facade.They"), which do not affect data.
9. **Multi-valued fields:** Berill-5M faction is `IPSF and Corps`; relationship
   cells are comma lists. (Spark's trailing comma is fixed.)
10. **Free text in numeric fields:** Stechkin range `25m/50m (200m w/ stock)`;
    ranges with thousands separators (`"1,000m"`); trailing spaces on four
    values (`II ` for 6B47 Helmet, `The Dead City `, `Exclusively Ukrainian `,
    `Enerhetyk `). Stowage cells also carry inch conversions, e.g.
    `943mm (37.1in)/700mm (27.6in)`, which the tables above drop.
11. **Possible observation:** RPG-7V1's value (53125) equals 50000 plus the
    PG-7VL price (3125), which may mean launcher prices include a loaded round.
    RPG-22 (22000, rocket 2500) does not follow an obvious round-number pattern,
    which weakens this. Pure speculation **[GUESS]**.
12. **Weapon vs. ammo consistency:** each weapon repeats its ammo's Dmg and AP.
    The validator should assert they match (finding #4 above came from this check).
    Programmatic checks on 2026-11-20 and 2026-11-21 confirmed 9A91 is the only
    mismatch.
13. **No fire-capability column.** The weapon table doesn't say which weapons
    can fire bursts or full auto. The author agrees one should be added
    (2026-11-22). Until then, capability comes from the weapon's class
    (section 3, rule 4). When the column arrives, the converter should read it
    and the class-based fallback should be removed.

---

## 10. Status and next steps

| Question | Status |
|---|---|
| #1 meaning of the `/` in damage | **Answered:** a plus sign; dice are added together |
| #2 "half the number that beats AC" | **Answered:** half the remainder (margin), rounded down |
| #3 range modifier wording | **Mostly answered:** +2 within 5m (CQB, provisional), +0 beyond that, -3 beyond the weapon's range. Open: max vs effective range, and optics |
| #4 AC per armor level | **Answered:** AC row is total AC (Base 10 to IV 15); with several pieces, use the highest-level piece (provisional) |
| #5 meaning of "equivalent" ammo | **Answered:** tier = grid column vs armor level. Lower: half (round up). Same: 25% removed (round up). Higher: full. Then Prot %, then add velocity, hollow-point and AP damage (weapon `Rnd AP`, AP rounds only) |
| #6 Prot values are percentages | **Answered:** yes |

Next steps, in order:

1. ~~Converter, schemas and validator.~~ **Done** (section 1). When the sheet
   changes, replace the CSV with a fresh export (reachable through the Drive
   connector) and run `npm run data`.
2. ~~Worked-example attack document.~~ **Written**; awaiting the author's review.
3. ~~Attack engine.~~ **Done** (2026-11-27): `src/engine/attack.ts`
   (`resolveTurn`) takes weapon, ammo, variant, worn armor, distance, mounting
   and rounds per pull, and returns every step of the working. All provisional
   rules and guesses are labeled settings in `src/engine/settings.ts`. The 11
   worked examples are tests in `test/engine.test.ts`.
   `scripts/worked_examples.py` was the prototype and is superseded.
4. Minimal UI (phase 3): pick attacker weapon, ammo, target armor, distance and
   pulls; show the breakdown. Web first.
