import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { RoundResult, TurnResult } from "../engine/attack.ts";
import { Mono, Note, Row, Section } from "./components.tsx";
import { colors, mono, space } from "./theme.ts";

export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);
export const MODE_NAME = { single: "single", burst: "burst", auto: "full auto" } as const;

const TIER_TEXT: Record<RoundResult["tierStep"], string> = {
  unarmored: "no level",
  lower: "½ lower tier",
  equal: "−25% same tier",
  higher: "full, higher tier",
};

/** The full step-by-step working of a turn. `children` render at the bottom. */
export function ResultView({ result, title = "RESULT", children }: { result: TurnResult; title?: string; children?: ReactNode }) {
  return (
    <Section title={title}>
      <Row style={{ alignItems: "baseline" }}>
        <Text style={styles.total}>{result.totalDamage}</Text>
        <Text style={styles.totalUnit}>damage</Text>
        <View style={{ flex: 1 }} />
        <Mono style={{ color: colors.muted }}>
          {result.roundsHit} of {result.roundsFired} rounds hit
        </Mono>
      </Row>
      <Mono style={{ color: colors.muted }}>
        AC {result.targetAc}
        {result.ap > 0 && result.armorLevel ? ` − AP ${result.ap} = ${result.effectiveAc}` : ""} · Prot {result.protPercent}% · range {signed(result.rangeMod)}
        {result.unmountedMod ? ` · unmounted ${signed(result.unmountedMod)}` : ""}
      </Mono>
      {result.pulls.map((p, i) => (
        <View key={i} style={styles.pull}>
          <Mono style={{ color: p.hit ? colors.text : colors.muted }}>
            Pull {i + 1} · {p.roundsFired} rd{p.roundsFired === 1 ? "" : "s"} {MODE_NAME[p.fireMode]}: d20 {p.d20} {signed(result.rangeMod)} range {signed(p.fireModeMod)} mode
            {result.unmountedMod ? ` ${signed(result.unmountedMod)} unmounted` : ""} = {p.toHit} vs {result.effectiveAc} →{" "}
            {p.hit ? `beats by ${p.margin}, ${p.roundsHit} hit` : "miss"}
          </Mono>
          {p.rounds.map((r, k) => (
            <Mono key={k}>
              {`  R${k + 1}  ${r.dice.join("+")}=${r.diceTotal} → ${TIER_TEXT[r.tierStep]} ${r.afterTier} → Prot −${r.protRemoved} = ${r.afterProt} → +${r.velocity} vel${
                r.hollowPoint ? ` +${r.hollowPoint} HP` : ""
              }${r.ap ? ` +${r.ap} AP` : ""} = `}
              <Text style={{ color: colors.amber, fontWeight: "700" }}>{r.damage}</Text>
            </Mono>
          ))}
          {p.roundsMissed > 0 && <Note>{p.roundsMissed} missed (suppression)</Note>}
        </View>
      ))}
      {children}
    </Section>
  );
}

const styles = StyleSheet.create({
  total: { color: colors.amber, fontFamily: mono, fontSize: 44, fontWeight: "700" },
  totalUnit: { color: colors.muted, fontSize: 15 },
  pull: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: space.sm, gap: space.xs },
});
