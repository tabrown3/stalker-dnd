import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Armor, Weapon } from "../data/schema.ts";
import {
  AttackError,
  canFireMultiple,
  checkAttack,
  damageDiceOf,
  fireModeFor,
  previewHits,
  resolveTurn,
  unmountedApplies,
  type AttackInput,
  type PullHit,
  type TurnResult,
} from "../engine/attack.ts";
import { randomRoller, scriptedRoller } from "../engine/dice.ts";
import { DEFAULT_SETTINGS } from "../engine/settings.ts";
import { Button, Label, Mono, Note, NumberField, Row, Section, Segmented, SelectField, Toggle, type SelectOption } from "./components.tsx";
import { ammoById, armorById, data, weaponById } from "./data.ts";
import { blankDamageEntry, fillEmpty, orderedRolls, parseRoll } from "./entry.ts";
import { ExportPanel } from "./ExportPanel.tsx";
import { MODE_NAME, ResultView, signed } from "./ResultView.tsx";
import { APP_VERSION } from "../version.ts";
import { colors, mono, space } from "./theme.ts";

const settings = DEFAULT_SETTINGS;
const ctx = { tables: data.tables, ammoVariants: data.ammoVariants, settings };


const weaponOptions: SelectOption[] = [...data.weapons]
  .sort((a, b) => a.class.localeCompare(b.class) || a.name.localeCompare(b.name))
  .map((w) => ({ value: w.id, label: w.name, group: w.class, detail: `${ammoById.get(w.ammoId)?.name} · ${w.range.effectiveM}/${w.range.maxM}m` }));

const armorOptions = (slot: "head" | "body"): SelectOption[] => [
  { value: "", label: "None" },
  ...data.armor
    .filter((a) => settings.armorSlots[slot].includes(a.type))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
    .map((a) => ({ value: a.id, label: a.name, group: a.type, detail: `${a.level ?? "no level"} · Phys ${a.prot.phys}%` })),
];
const bodyOptions = armorOptions("body");
const headOptions = armorOptions("head");

type Phase = { kind: "setup" } | { kind: "d20"; d20s: string[] } | { kind: "damage"; d20s: string[]; hits: PullHit[]; damage: string[][][] } | { kind: "result"; result: TurnResult; input: AttackInput; rolledBy: "app" | "player"; id: number };

export function AttackScreen({ onOpenImport }: { onOpenImport: () => void }) {
  const [weaponId, setWeaponId] = useState("ak-74");
  const [variant, setVariant] = useState<"normal" | "ap" | "hollow-point">("normal");
  const [mounted, setMounted] = useState(false);
  const [bodyId, setBodyId] = useState("psz-5d");
  const [headId, setHeadId] = useState("");
  const [distance, setDistance] = useState("150");
  const [pulls, setPulls] = useState<string[]>(["3"]);
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });

  const weapon = weaponById.get(weaponId)!;
  const ammo = ammoById.get(weapon.ammoId)!;
  const multi = canFireMultiple(weapon, settings);
  const diceSides = damageDiceOf(ammo);

  // Any change to the attack discards rolls in progress.
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPhase({ kind: "setup" });
    };

  const act = (fn: () => void) => () => {
    fn();
    setPhase({ kind: "setup" });
  };

  const pickWeapon = edit((id: string) => {
    setWeaponId(id);
    const w = weaponById.get(id)!;
    if (!canFireMultiple(w, settings)) setPulls((p) => p.map(() => "1"));
  });

  const targetArmor: Armor[] = [bodyId, headId].filter((id) => id !== "").map((id) => armorById.get(id)!);
  const parsedPulls = pulls.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  const distanceM = distance.trim() === "" ? NaN : Number(distance);

  const input: AttackInput = {
    weapon,
    ammo,
    variantId: variant === "normal" ? null : variant,
    targetArmor,
    distanceM,
    mounted,
    pulls: parsedPulls,
  };

  const check = useMemo(() => {
    if (!Number.isFinite(distanceM)) return { error: "Enter the distance in meters." };
    try {
      return { setup: checkAttack(input, ctx) };
    } catch (e) {
      if (e instanceof AttackError) return { error: e.message };
      throw e;
    }
    // input is rebuilt every render; its parts are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weaponId, variant, mounted, bodyId, headId, distance, pulls.join(",")]);
  const setup = check.setup;
  const totalRounds = parsedPulls.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

  const rollForMe = () => setPhase({ kind: "result", result: resolveTurn(input, { ...ctx, roll: randomRoller }), input, rolledBy: "app", id: Date.now() });
  const startEntry = () => setPhase({ kind: "d20", d20s: pulls.map(() => "") });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>ATTACK</Text>

      <Section title="ATTACKER">
        <Row>
          <Label>Weapon</Label>
          <SelectField label="Weapon" value={weaponId} options={weaponOptions} onChange={pickWeapon} />
        </Row>
        <Row>
          <Label>Ammo</Label>
          <Segmented
            value={variant}
            onChange={edit(setVariant)}
            options={[
              { value: "normal", label: "Normal" },
              { value: "ap", label: `AP` },
              { value: "hollow-point", label: "Hollow-point" },
            ]}
          />
        </Row>
        <Note>
          {weapon.class} · {ammo.name} (tier {ammo.tier}) · {weapon.damage.map((d) => `${d.count}d${d.sides}`).join(" + ")} · velocity {signed(weapon.velocity)} · Rnd AP{" "}
          {weapon.ap}
        </Note>
        {unmountedApplies(weapon, settings) && <Toggle label={`Mounted (unmounted ${signed(settings.unmountedPenalty.mod)} to hit)`} value={mounted} onChange={edit(setMounted)} />}
      </Section>

      <Section title="TARGET">
        <Row>
          <Label>Body</Label>
          <SelectField label="Body armor" value={bodyId} options={bodyOptions} onChange={edit(setBodyId)} />
        </Row>
        <Row>
          <Label>Head</Label>
          <SelectField label="Head (mask or helmet)" value={headId} options={headOptions} onChange={edit(setHeadId)} />
        </Row>
        <Row>
          <Label>Distance</Label>
          <NumberField label="Distance in meters" value={distance} onChange={edit(setDistance)} width={88} invalid={!Number.isFinite(distanceM)} />
          <Text style={styles.unit}>m</Text>
          {setup && <Note tone={setup.rangeMod < 0 ? "amber" : "muted"}>{rangeLabel(weapon, setup.rangeMod)}</Note>}
        </Row>
        {setup && (
          <Mono style={{ color: colors.muted }}>
            AC {setup.targetAc}
            {setup.ap > 0 && setup.armorLevel ? ` − AP ${setup.ap} = ${setup.effectiveAc}` : ""} · level {setup.armorLevel ?? "none"} · Prot {setup.protPercent}%
          </Mono>
        )}
      </Section>

      <Section title="FIRE" right={<Mono style={{ color: totalRounds > (setup?.turnCap ?? Infinity) ? colors.danger : colors.muted }}>{`${totalRounds}/${setup?.turnCap ?? "—"} rds this turn`}</Mono>}>
        {pulls.map((p, i) => {
          const n = parsedPulls[i]!;
          const mode = Number.isFinite(n) && n >= 1 ? fireModeFor(n, settings) : null;
          return (
            <Row key={i}>
              <Text style={styles.pullLabel}>Pull {i + 1}</Text>
              {multi ? (
                <NumberField
                  label={`Rounds on pull ${i + 1}`}
                  value={p}
                  onChange={edit((v: string) => setPulls((all) => all.map((x, k) => (k === i ? v.replace(/\D/g, "") : x))))}
                  invalid={!mode}
                />
              ) : (
                <Mono>1</Mono>
              )}
              <Text style={styles.unit}>rd{n === 1 ? "" : "s"}</Text>
              <Note>{mode ? `${MODE_NAME[mode.mode]} ${signed(mode.mod)}` : "rounds?"}</Note>
              <View style={{ flex: 1 }} />
              {pulls.length > 1 && <Button label="Remove" kind="ghost" compact onPress={act(() => setPulls((all) => all.filter((_, k) => k !== i)))} />}
            </Row>
          );
        })}
        <Row>
          {multi ? (
            [1, 3, 6, 10, 30].map((n) => <Button key={n} compact label={`+ ${n === 1 ? "single" : `${n} rds`}`} onPress={act(() => setPulls((all) => [...all, String(n)]))} />)
          ) : (
            <Button compact label="+ pull" onPress={act(() => setPulls((all) => [...all, "1"]))} />
          )}
        </Row>
        {!multi && <Note>{weapon.class}s fire one round per pull, up to {settings.turnCaps.singleShot} pulls a turn.</Note>}
      </Section>

      {check.error ? (
        <Note tone="danger">{check.error}</Note>
      ) : phase.kind === "setup" || phase.kind === "result" ? (
        <Row style={{ marginBottom: space.md }}>
          <View style={{ flex: 1 }}>
            <Button kind="primary" label={phase.kind === "result" ? "ROLL AGAIN" : "ROLL"} onPress={rollForMe} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="ENTER DICE" onPress={startEntry} />
          </View>
        </Row>
      ) : null}

      {phase.kind === "d20" && (
        <Section title="ENTER TO-HIT ROLLS">
          {pulls.map((_, i) => (
            <Row key={i}>
              <Text style={styles.pullLabel}>Pull {i + 1}</Text>
              <Text style={styles.unit}>d20</Text>
              <NumberField
                label={`d20 for pull ${i + 1}`}
                value={phase.d20s[i]!}
                invalid={phase.d20s[i] !== "" && parseRoll(phase.d20s[i]!, 20) === null}
                onChange={(v) => setPhase({ ...phase, d20s: phase.d20s.map((x, k) => (k === i ? v : x)) })}
              />
            </Row>
          ))}
          <Row>
            <Button compact label="Roll empty ones" onPress={() => setPhase({ ...phase, d20s: fillEmpty(phase.d20s, phase.d20s.map(() => 20), randomRoller) })} />
            <Button compact label="Cancel" kind="ghost" onPress={() => setPhase({ kind: "setup" })} />
            <View style={{ flex: 1 }} />
            <Button
              kind="primary"
              label="NEXT"
              disabled={phase.d20s.some((t) => parseRoll(t, 20) === null)}
              onPress={() => {
                const d20s = phase.d20s.map((t) => parseRoll(t, 20)!);
                const { pulls: hits } = previewHits(input, d20s, ctx);
                const damage = blankDamageEntry(hits, diceSides);
                const next = { kind: "damage" as const, d20s: phase.d20s, hits, damage };
                // Nothing hit: there are no damage dice to ask for.
                if (hits.every((h) => h.roundsHit === 0)) finish(next);
                else setPhase(next);
              }}
            />
          </Row>
        </Section>
      )}

      {phase.kind === "damage" && (
        <Section title="ENTER DAMAGE ROLLS">
          {phase.hits.map((h, i) => (
            <View key={i} style={{ gap: space.xs }}>
              <Mono style={{ color: h.hit ? colors.text : colors.muted }}>
                Pull {i + 1}: {h.toHit} vs AC {setup?.effectiveAc} → {h.hit ? `${h.roundsHit} of ${h.roundsFired} hit` : "miss"}
              </Mono>
              {phase.damage[i]!.map((round, r) => (
                <Row key={r} style={{ paddingLeft: space.md }}>
                  <Text style={styles.unit}>Round {r + 1}</Text>
                  {round.map((t, k) => (
                    <Row key={k} style={{ gap: space.xs }}>
                      <Text style={styles.unit}>d{diceSides[k]}</Text>
                      <NumberField
                        label={`Pull ${i + 1} round ${r + 1} d${diceSides[k]}`}
                        value={t}
                        width={52}
                        invalid={t !== "" && parseRoll(t, diceSides[k]!) === null}
                        onChange={(v) => setPhase({ ...phase, damage: setDie(phase.damage, i, r, k, v) })}
                      />
                    </Row>
                  ))}
                </Row>
              ))}
            </View>
          ))}
          <Row>
            <Button
              compact
              label="Roll empty ones"
              onPress={() => setPhase({ ...phase, damage: phase.damage.map((pull) => pull.map((round) => fillEmpty(round, diceSides, randomRoller))) })}
            />
            <Button compact label="Back" kind="ghost" onPress={() => setPhase({ kind: "d20", d20s: phase.d20s })} />
            <View style={{ flex: 1 }} />
            <Button kind="primary" label="RESOLVE" disabled={orderedRolls(phase.d20s, phase.damage, diceSides) === null} onPress={() => finish(phase)} />
          </Row>
        </Section>
      )}

      {phase.kind === "result" && (
        <ResultView result={phase.result}>
          <ExportPanel key={phase.id} input={phase.input} result={phase.result} rolledBy={phase.rolledBy} />
        </ResultView>
      )}

      <Row style={{ justifyContent: "space-between", marginTop: space.sm }}>
        <Note>v{APP_VERSION}</Note>
        <Text accessibilityRole="link" onPress={onOpenImport} style={styles.debugLink}>
          Debug: import
        </Text>
      </Row>
    </ScrollView>
  );

  function finish(p: { d20s: string[]; damage: string[][][] }) {
    const rolls = orderedRolls(p.d20s, p.damage, diceSides);
    if (!rolls) return;
    setPhase({ kind: "result", result: resolveTurn(input, { ...ctx, roll: scriptedRoller(rolls) }), input, rolledBy: "player", id: Date.now() });
  }
}

function setDie(damage: string[][][], pull: number, round: number, die: number, v: string): string[][][] {
  return damage.map((p, i) => (i !== pull ? p : p.map((r, j) => (j !== round ? r : r.map((x, k) => (k === die ? v : x))))));
}

function rangeLabel(w: Weapon, mod: number): string {
  const r = settings.range;
  if (mod === r.cqbMod) return `CQB (≤${r.cqbM}m) ${signed(mod)}`;
  if (mod === r.beyondRangeMod) return `beyond ${w.range[r.beyondRangeUses]}m ${signed(mod)}`;
  return `in range (max ${w.range.maxM}m) +0`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, width: "100%", maxWidth: 680, alignSelf: "center" },
  title: { color: colors.amber, fontFamily: mono, fontSize: 20, letterSpacing: 6, fontWeight: "700", marginBottom: space.md },
  unit: { color: colors.muted, fontSize: 13 },
  pullLabel: { color: colors.text, fontSize: 14, width: 52 },
  debugLink: { color: colors.muted, fontSize: 12, textDecorationLine: "underline" },
});
