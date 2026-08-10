import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { SpecRow } from "@/components/SpecRow";
import { getApiBase } from "@/lib/api";
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
          {/*
            One choice from a fixed set of three — the segmented control, the
            same one Schedule and Protected payment use, rather than a third
            hand-built row of chips.
          */}
          <SegmentedControl
            options={THEME_OPTIONS}
            value={preference}
            onChange={setThemePreference}
            accessibilityLabel="Theme"
          />
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

        {/*
          The address of the GRIDGO this build is talking to. It lives here
          rather than on Account because it is a fact about the app, not about
          the shop — and it is what someone reads out when a phone on a shop's
          wifi cannot reach the platform.
        */}
        <View className="mt-8 gap-3">
          <Text className="text-overline text-text-muted">CONNECTION</Text>
          <View className="gg-card">
            <SpecRow label="GRIDGO address" value={getApiBase()} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
