import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenHeader } from "@/components/ScreenHeader";
import { SpecRow } from "@/components/SpecRow";
import { getApiBase } from "@/lib/api";
import {
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from "@/hooks/useTheme";
import { useSession } from "@/store/session";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function AccountScreen() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const preference = useThemePreference();
  const apiBase = getApiBase();

  return (
    <View className="gg-screen">
      <ScrollView className="flex-1" contentContainerClassName="gg-page pb-10" showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Account" subtitle="Identity, theme, and connection" />

        <View className="gg-card">
          <SpecRow label="Name" value={user?.name || "—"} />
          <SpecRow label="Email" value={user?.email || "—"} />
          <SpecRow label="Shop" value={user?.supplierName || "—"} />
          <SpecRow label="Role" value="Supplier" />
        </View>

        <View className="mt-4 gap-3">
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

        <View className="gg-card mt-6">
          <Text className="mb-1 text-overline text-text-muted">BACKEND</Text>
          <SpecRow label="API base" value={apiBase} />
        </View>

        <Pressable
          onPress={() => router.push("/payout")}
          accessibilityRole="button"
          className="gg-card mt-3 flex-row items-center justify-between"
        >
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-body font-medium text-text-primary">Protected payment</Text>
            <Text className="text-caption text-text-muted">
              Gross, settlement state, and hold reasons
            </Text>
          </View>
          <Text className="text-caption text-brand">Open</Text>
        </Pressable>

        <Pressable
          onPress={() => void logout()}
          accessibilityRole="button"
          className="gg-btn-secondary mt-8"
        >
          <Text className="text-button text-text-primary">Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
