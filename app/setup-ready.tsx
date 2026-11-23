import { router } from "expo-router";
import { Check, Hourglass } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FormScrollView } from "@/components/FormScrollView";
import { HowYouEarn } from "@/components/money/HowYouEarn";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { spacing } from "@/constants/theme";
import { useReadiness } from "@/hooks/useReadiness";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import type { ShopMoneySchedule } from "@/lib/shopMoney";
import { isShopOwner, useSession } from "@/store/session";

/**
 * The finish line of guided sign-up (gridgo-supplier#265).
 *
 * "Ready for jobs" is said only when GRIDGO's own readiness says the shop can
 * be matched (`GET /me/supplier-readiness`, `operational.ready`). Until then
 * the same moment is still a finish — the setup is saved — and it says
 * plainly what GRIDGO is checking, rather than letting a quiet To do read as
 * a shop nobody wants.
 *
 * "How you earn" is GRIDGO's own schedule (`GET /settings` shopMoney); with
 * none, nothing is promised.
 */
export default function SetupReadyScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const user = useSession((s) => s.user);
  const { readiness } = useReadiness();
  const [schedule, setSchedule] = useState<ShopMoneySchedule | null>(null);
  const [scheduleRead, setScheduleRead] = useState(false);

  useEffect(() => {
    let live = true;
    void api.getShopMoneySchedule().then((next) => {
      if (!live) return;
      setSchedule(next);
      setScheduleRead(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const ready = readiness?.ready === true;
  const owner = isShopOwner(user);

  return (
    <View className="gg-screen">
      <FormScrollView contentClassName="gg-page gap-8 pb-8 pt-12">
        <View className="items-center gap-4">
          <Animated.View
            entering={reducedMotion ? undefined : ZoomIn.duration(240)}
            className={
              ready
                ? "h-24 w-24 items-center justify-center rounded-pill bg-success"
                : "h-24 w-24 items-center justify-center rounded-pill bg-accent"
            }
          >
            {ready || !readiness ? (
              <Check size={48} color={colors.accentOn} strokeWidth={3} aria-hidden />
            ) : (
              <Hourglass size={40} color={colors.accentOn} strokeWidth={2} aria-hidden />
            )}
          </Animated.View>
          <View className="items-center gap-2">
            <Text className="text-center text-display text-text-primary" testID="ready-title">
              {ready ? "Ready for jobs" : "Your shop is set up"}
            </Text>
            <Text className="text-center text-body-lg text-text-secondary">
              {ready
                ? "Jobs that fit your shop come to To do. Accept them within the hour."
                : "GRIDGO is checking your shop and listings. Jobs start once they are approved, usually within a working day."}
            </Text>
          </View>
        </View>

        {owner ? (
          scheduleRead ? (
            <View className="gap-2">
              <HowYouEarn schedule={schedule} />
              {schedule ? (
                <Pressable
                  onPress={() => router.push("/legal")}
                  accessibilityRole="link"
                  className="gg-touch justify-center"
                >
                  <Text className="text-button text-brand">How fees work</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <SkeletonBlock className="h-32 w-full" />
          )
        ) : null}
      </FormScrollView>
      <View className="gg-page bg-canvas pt-4" style={{ paddingBottom: insets.bottom + spacing.lg }}>
        <PrimaryButton
          label="Go to To do"
          hint="Adto sa To do"
          onPress={() => router.replace("/(tabs)/home")}
          testID="ready-go"
        />
      </View>
    </View>
  );
}
