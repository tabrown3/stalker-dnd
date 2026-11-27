import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { ImportError, decodeExport, replayExport, type DebugExport, type Replay } from "../debug/export.ts";
import { APP_VERSION, BUILD } from "../version.ts";
import { Button, Mono, Note, Row, Section } from "./components.tsx";
import { armorById, data, weaponById } from "./data.ts";
import { ResultView } from "./ResultView.tsx";
import { colors, mono, radius, space } from "./theme.ts";

type State = { kind: "empty" } | { kind: "error"; message: string; exp?: DebugExport } | { kind: "ok"; exp: DebugExport; replay: Replay };

/** Paste a debug code from a player to see their attack replayed. */
export function ImportScreen({ onBack }: { onBack: () => void }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ kind: "empty" });

  const load = () => {
    let exp: DebugExport | undefined;
    try {
      exp = decodeExport(text);
      setState({ kind: "ok", exp, replay: replayExport(exp, data) });
    } catch (e) {
      if (!(e instanceof ImportError)) throw e;
      setState({ kind: "error", message: e.message, exp });
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Row style={{ marginBottom: space.md }}>
        <Text style={styles.title}>DEBUG IMPORT</Text>
        <Row style={{ flex: 1, justifyContent: "flex-end" }}>
          <Button compact kind="ghost" label="← Back to attack" onPress={onBack} />
        </Row>
      </Row>

      <Section title="PASTE A DEBUG CODE">
        <TextInput
          accessibilityLabel="Debug code to import"
          value={text}
          onChangeText={setText}
          placeholder="ZC1:…"
          placeholderTextColor={colors.muted}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Row>
          <Button kind="primary" compact label="LOAD" disabled={text.trim() === ""} onPress={load} />
          <Note>
            This app: v{APP_VERSION} ({BUILD})
          </Note>
        </Row>
      </Section>

      {state.kind === "error" && (
        <Section title="COULDN'T REPLAY">
          <Note tone="danger">{state.message}</Note>
          {state.exp && <ExportFacts exp={state.exp} />}
        </Section>
      )}

      {state.kind === "ok" && (
        <>
          <Section title="EXPORT">
            <ExportFacts exp={state.exp} />
            {state.exp.app !== APP_VERSION && <Note tone="amber">Made on v{state.exp.app}; this is v{APP_VERSION}. The replay below uses this version's rules.</Note>}
            {!state.replay.sameData && <Note tone="amber">The game data has changed since this export (the sheet was updated).</Note>}
            {state.replay.differs ? (
              <Note tone="danger">
                This version gets a different answer. The player saw {state.exp.seen.total} damage
                {state.exp.seen.rounds.some((r) => r.length) ? ` (rounds: ${state.exp.seen.rounds.map((r) => (r.length ? r.join(", ") : "miss")).join(" | ")})` : ""}; the
                replay gives {state.replay.result.totalDamage}.
              </Note>
            ) : (
              <Note>Replay matches what the player saw: {state.exp.seen.total} damage.</Note>
            )}
          </Section>
          <ResultView result={state.replay.result} title="REPLAY (THIS VERSION)" />
        </>
      )}
    </ScrollView>
  );
}

function ExportFacts({ exp }: { exp: DebugExport }) {
  const i = exp.input;
  const name = (id: string | null) => (id ? (armorById.get(id)?.name ?? id) : "none");
  return (
    <>
      {exp.note !== "" && (
        <Text style={styles.quote}>
          “{exp.note}”
        </Text>
      )}
      <Mono style={{ color: colors.muted }}>
        v{exp.app} ({exp.build}) · data {exp.data} · {new Date(exp.at).toLocaleString()} · rolled by {exp.rolledBy}
      </Mono>
      <Mono>
        {weaponById.get(i.weapon)?.name ?? i.weapon} · {i.variant ?? "normal"} rounds{i.mounted ? " · mounted" : ""} · {i.distanceM}m · pulls {i.pulls.join(", ")}
      </Mono>
      <Mono>
        Target: body {name(i.body)} · head {name(i.head)}
      </Mono>
      <Mono style={{ color: colors.muted }}>Rolls: {exp.rolls.join(" ")}</Mono>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, width: "100%", maxWidth: 680, alignSelf: "center" },
  title: { color: colors.amber, fontFamily: mono, fontSize: 20, letterSpacing: 4, fontWeight: "700" },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius,
    color: colors.text,
    fontFamily: mono,
    fontSize: 12,
    minHeight: 90,
    padding: space.sm,
    textAlignVertical: "top",
  },
  quote: { color: colors.text, fontSize: 15, fontStyle: "italic" },
});
