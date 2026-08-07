import { router } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Launcher.
 *
 * Scaffolding, not product. It exists so the screens built so far can be
 * opened on a device without a sign-in flow. The client home screen replaces
 * this route once auth and role gating land.
 *
 * Laid out as a job ticket rather than a menu, because that is the document
 * the rest of the app is built from — the same ruled rows and overline the
 * design system uses.
 */
export default function LauncherScreen() {
  const colors = useThemeColors();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
      <View className="gg-page flex-1 justify-center gap-8 pb-8">
        <View>
          <GridgoLogo size={40} />
          <Text className="pt-3 text-body text-text-secondary">
            Managed printing · Davao City pilot
          </Text>
        </View>

        <View className="border-t border-outline">
          <SpecRow label="Build" value="Pre-alpha" />
          <SpecRow label="Screens" value="7" />
          <SpecRow label="Role" value="Client" />
        </View>

        <View className="gap-3">
          <Text className="text-overline text-text-muted">OPEN</Text>
          <PrimaryButton label="Onboarding" onPress={() => router.push("/onboarding")} />
          <SecondaryButton label="App shell" onPress={() => router.push("/home")} />
          <SecondaryButton label="Design system" onPress={() => router.push("/design-system")} />
        </View>
      </View>
    </SafeAreaView>
  );
}
