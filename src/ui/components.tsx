import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { colors, mono, radius, space } from "./theme.ts";

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Mono({ children, style }: { children: ReactNode; style?: TextStyle | TextStyle[] }) {
  return <Text style={[styles.mono, style]}>{children}</Text>;
}

export function Note({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "danger" | "amber" }) {
  const color = tone === "danger" ? colors.danger : tone === "amber" ? colors.amber : colors.muted;
  return <Text style={[styles.note, { color }]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  kind = "secondary",
  disabled,
  compact,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        kind === "primary" && styles.buttonPrimary,
        kind === "ghost" && styles.buttonGhost,
        pressed && { opacity: 0.75 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={[styles.buttonText, kind === "primary" && { color: colors.bg }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, on && { color: colors.bg }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={styles.toggle}>
      <View style={[styles.checkbox, value && styles.checkboxOn]}>{value && <Text style={styles.check}>✓</Text>}</View>
      <Text style={styles.toggleText}>{label}</Text>
    </Pressable>
  );
}

export function NumberField({
  value,
  onChange,
  width = 64,
  placeholder,
  invalid,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  width?: number;
  placeholder?: string;
  invalid?: boolean;
  label: string;
}) {
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={(t) => onChange(t.replace(/[^\d.]/g, ""))}
      keyboardType="decimal-pad"
      inputMode="decimal"
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      selectTextOnFocus
      style={[styles.input, { width }, invalid && { borderColor: colors.danger }]}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
  detail?: string;
  group?: string;
}

/** A field that opens a searchable list. Works the same on web and phones. */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose…",
}: {
  label: string;
  value: string | null;
  options: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q ? options.filter((o) => `${o.label} ${o.detail ?? ""} ${o.group ?? ""}`.toLowerCase().includes(q)) : options;
    // Insert group headers between runs of the same group.
    const rows: ({ kind: "header"; group: string } | { kind: "option"; option: SelectOption })[] = [];
    let last: string | undefined;
    for (const o of hits) {
      if (o.group && o.group !== last) rows.push({ kind: "header", group: o.group });
      last = o.group;
      rows.push({ kind: "option", option: o });
    }
    return rows;
  }, [options, query]);

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? "none"}`} onPress={() => setOpen(true)} style={styles.select}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.selectText, !current && { color: colors.muted }]} numberOfLines={1}>
            {current?.label ?? placeholder}
          </Text>
          {current?.detail ? (
            <Text style={styles.selectDetail} numberOfLines={1}>
              {current.detail}
            </Text>
          ) : null}
        </View>
        <Text style={styles.caret}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Row style={{ marginBottom: space.sm }}>
              <Text style={[styles.sectionTitle, { flex: 1 }]}>{label}</Text>
              <Button label="Close" kind="ghost" compact onPress={() => setOpen(false)} />
            </Row>
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={colors.muted}
              style={[styles.input, { width: "100%", textAlign: "left", marginBottom: space.sm }]}
            />
            <FlatList
              data={shown}
              keyExtractor={(r) => (r.kind === "header" ? `h:${r.group}` : r.option.value)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) =>
                item.kind === "header" ? (
                  <Text style={styles.groupHeader}>{item.group}</Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      onChange(item.option.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    style={({ pressed }) => [styles.option, item.option.value === value && styles.optionOn, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.selectText}>{item.option.label}</Text>
                    {item.option.detail ? <Text style={styles.selectDetail}>{item.option.detail}</Text> : null}
                  </Pressable>
                )
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius,
    padding: space.md,
    marginBottom: space.md,
    gap: space.sm,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: colors.olive, fontFamily: mono, fontSize: 12, letterSpacing: 2, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  label: { color: colors.muted, fontSize: 13, width: 72 },
  mono: { color: colors.text, fontFamily: mono, fontSize: 13 },
  note: { fontSize: 13, lineHeight: 18 },
  button: {
    borderColor: colors.olive,
    borderWidth: 1,
    borderRadius: radius,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.lg,
    alignItems: "center",
  },
  buttonCompact: { paddingVertical: space.xs + 2, paddingHorizontal: space.md },
  buttonPrimary: { backgroundColor: colors.amber, borderColor: colors.amber },
  buttonGhost: { borderColor: "transparent" },
  buttonText: { color: colors.text, fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
  segmented: { flexDirection: "row", borderColor: colors.border, borderWidth: 1, borderRadius: radius, overflow: "hidden", flexShrink: 1 },
  segment: { paddingVertical: space.sm, paddingHorizontal: space.md, backgroundColor: colors.surfaceRaised },
  segmentOn: { backgroundColor: colors.olive },
  segmentText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  toggle: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: colors.olive, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: colors.olive },
  check: { color: colors.bg, fontWeight: "900", fontSize: 13 },
  toggleText: { color: colors.text, fontSize: 14 },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius,
    color: colors.text,
    fontFamily: mono,
    fontSize: 15,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    textAlign: "center",
  },
  select: {
    flex: 1,
    minWidth: 180,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  selectText: { color: colors.text, fontSize: 15 },
  selectDetail: { color: colors.muted, fontSize: 12, fontFamily: mono, marginTop: 2 },
  caret: { color: colors.muted, marginLeft: space.sm },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: space.lg },
  sheet: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "85%",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius,
    padding: space.md,
  },
  groupHeader: { color: colors.olive, fontFamily: mono, fontSize: 11, letterSpacing: 1.5, marginTop: space.md, marginBottom: space.xs },
  option: { paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: radius },
  optionOn: { backgroundColor: colors.oliveDim },
});
