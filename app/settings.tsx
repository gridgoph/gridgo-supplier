import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from "@/hooks/useTheme";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * App settings — presentation preferences and replayable product tours.
 *
 * Identity and sign-out stay on Account. This screen is a pushed destination
 * from Account, not a second account form.
 */
export default function SettingsScreen() {
  const preference = useThemePreference();

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-10"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-3">
          <Text className="text-overline text-text-muted">THEME</Text>
          <Text className="text-body text-text-secondary">
            Light and Dark are the same product. Follow the system, or pin one.
          </Text>
          <View className="flex-row gap-2">
            {THEME_OPTIONS.map((option) => {
              const selected = option.value === preference;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setThemePreference(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={
                    selected
                      ? "gg-chip gg-touch border-accent bg-accent px-4"
                      : "gg-chip gg-touch bg-surface px-4"
                  }
                >
                  <Text
                    className={
                      selected
                        ? "text-button text-accent-on"
                        : "text-button text-text-secondary"
                    }
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mt-8 gap-3">
          <Text className="text-overline text-text-muted">ABOUT</Text>
          <Pressable
            onPress={() =>
              router.push({ pathname: "/onboarding", params: { from: "settings" } })
            }
            accessibilityRole="button"
            accessibilityLabel="View onboarding"
            className="gg-card flex-row items-center justify-between"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <View className="min-w-0 flex-1 gap-1 py-1">
              <Text className="text-body font-medium text-text-primary">View onboarding</Text>
              <Text className="text-caption text-text-muted">
                Replay the three supplier beats — jobs, produce, hand off
              </Text>
            </View>
            <Text className="pl-3 text-body text-text-muted" accessibilityElementsHidden>
              ›
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
