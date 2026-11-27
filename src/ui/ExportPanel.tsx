import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { buildExport, encodeExport } from "../debug/export.ts";
import type { AttackInput, TurnResult } from "../engine/attack.ts";
import { APP_VERSION, BUILD } from "../version.ts";
import { Button, Note, Row } from "./components.tsx";
import { data } from "./data.ts";
import { colors, mono, radius, space } from "./theme.ts";

/** "Something look wrong?" panel under a result: optional note, copy a debug code. */
export function ExportPanel({ input, result, rolledBy }: { input: AttackInput; result: TurnResult; rolledBy: "app" | "player" }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState<"copied" | "failed" | null>(null);

  if (!open) {
    return (
      <View style={styles.wrap}>
        <Button compact kind="ghost" label="Something look wrong? Send a debug export" onPress={() => setOpen(true)} />
      </View>
    );
  }

  const copy = async () => {
    const c = encodeExport(buildExport({ input, result, rolledBy, note, app: APP_VERSION, build: BUILD, data }));
    setCode(c);
    try {
      await Clipboard.setStringAsync(c);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <View style={styles.wrap}>
      <Note>Add a note if you like, then copy the code and paste it in a message. It includes this attack, its rolls and the app version.</Note>
      <TextInput
        accessibilityLabel="Note for the debug export"
        value={note}
        onChangeText={(t) => {
          setNote(t);
          setCode(null);
          setStatus(null);
        }}
        placeholder="What looks wrong? (optional)"
        placeholderTextColor={colors.muted}
        multiline
        style={styles.note}
      />
      <Row>
        <Button compact kind="primary" label="COPY DEBUG CODE" onPress={copy} />
        {status === "copied" && <Note tone="amber">Copied. Paste it in a message.</Note>}
        {status === "failed" && <Note tone="danger">Couldn't copy. Select the code below and copy it.</Note>}
      </Row>
      {code && <TextInput accessibilityLabel="Debug code" value={code} editable={false} selectTextOnFocus multiline style={styles.code} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: space.sm, gap: space.sm },
  note: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius,
    color: colors.text,
    fontSize: 14,
    minHeight: 56,
    padding: space.sm,
    textAlignVertical: "top",
  },
  code: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius,
    color: colors.muted,
    fontFamily: mono,
    fontSize: 11,
    padding: space.sm,
  },
});
