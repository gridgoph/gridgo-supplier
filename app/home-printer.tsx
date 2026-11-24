import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { SkeletonBlock } from "@/components/Skeleton";
import { HomeLevels } from "@/components/home/HomeLevels";
import { useHomePrinter } from "@/store/homePrinter";

/**
 * Get to Starter / Verified for a home printer (gridgo-api#412). Its own
 * route as well as `/verify`'s home branch, because a home printer's level
 * is GRIDGO's home level, not the shop approval `/verify` is mounted for.
 */
export default function HomePrinterScreen() {
  const { first } = useLocalSearchParams<{ first?: string }>();
  const home = useHomePrinter((s) => s.home);
  const error = useHomePrinter((s) => s.error);

  useFocusEffect(
    useCallback(() => {
      void useHomePrinter.getState().load();
    }, []),
  );

  if (home) return <HomeLevels home={home} firstRun={first === "1"} />;
  if (home === false) {
    return (
      <View className="gg-screen gg-page pt-4">
        <EmptyState
          title="This account prints in a shop"
          body="Home printing levels are for people who print from home."
          actionLabel="Go to To do"
          onAction={() => router.replace("/(tabs)/home")}
        />
      </View>
    );
  }
  if (error) {
    return (
      <View className="gg-screen gg-page pt-4">
        <EmptyState
          title="Your levels did not load"
          body={error}
          actionLabel="Try again"
          onAction={() => void useHomePrinter.getState().load()}
        />
      </View>
    );
  }
  return (
    <View className="gg-screen gg-page gap-3 pt-4" accessibilityRole="progressbar" accessibilityLabel="Loading">
      <SkeletonBlock className="h-6 w-24 rounded-pill" />
      <SkeletonBlock className="h-8 w-2/3" />
      <SkeletonBlock className="h-5 w-full" />
      <SkeletonBlock className="mt-4 h-64 w-full rounded-card" />
    </View>
  );
}
