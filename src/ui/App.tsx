import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { AttackScreen } from "./AttackScreen.tsx";
import { colors } from "./theme.ts";

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AttackScreen />
      <StatusBar style="light" />
    </View>
  );
}
