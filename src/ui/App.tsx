import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { View } from "react-native";
import { AttackScreen } from "./AttackScreen.tsx";
import { ImportScreen } from "./ImportScreen.tsx";
import { colors } from "./theme.ts";

export default function App() {
  const [screen, setScreen] = useState<"attack" | "import">("attack");
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The attack screen stays mounted so its setup survives a trip to import. */}
      <View style={{ flex: 1, display: screen === "attack" ? "flex" : "none" }}>
        <AttackScreen onOpenImport={() => setScreen("import")} />
      </View>
      {screen === "import" && <ImportScreen onBack={() => setScreen("attack")} />}
      <StatusBar style="light" />
    </View>
  );
}
