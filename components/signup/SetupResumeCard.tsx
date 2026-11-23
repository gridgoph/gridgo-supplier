import { router, useFocusEffect } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import {
  doneCount,
  minutesLeft,
  REQUIRED_MISSIONS,
  setupComplete,
} from "@/lib/guidedSignup";
import { useGuidedSignup } from "@/store/guidedSignup";

/**
 * "Finish setting up" on To do, for a shop that left guided sign-up mid-way
 * (gridgo-supplier#265). Reads GRIDGO's record on every visit; draws nothing
 * for a shop that did not sign up this way, or that has finished.
 *
 * Charcoal, not yellow: To do's yellow belongs to the day's work. The count
 * and the minutes are what bring a busy owner back.
 */
export function SetupResumeCard({ enabled }: { enabled: boolean }) {
  const colors = useThemeColors();
  const signup = useGuidedSignup((s) => s.signup);

  useFocusEffect(
    useCallback(() => {
      if (enabled) void useGuidedSignup.getState().loadShop();
    }, [enabled]),
  );

  if (!enabled || !signup?.supplierId || setupComplete(signup)) return null;
  const done = doneCount(signup);
  const total = REQUIRED_MISSIONS.length;
  const waitingForOwner = signup.nextStep === "owner_claim";

  return (
    <Pressable
      onPress={() => router.push("/setup")}
      accessibilityRole="button"
      accessibilityLabel={`Finish setting up your shop. ${done} of ${total} done.`}
      className="gg-card mb-4 gap-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      testID="setup-resume"
    >
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body-lg font-medium text-text-primary">
            {waitingForOwner ? "Waiting for your owner" : "Finish setting up your shop"}
          </Text>
          <Text className="text-caption text-text-muted">
            {waitingForOwner
              ? "Send them the claim link so payouts can start."
              : `${done} of ${total} done · about ${minutesLeft(signup)} min left`}
          </Text>
        </View>
        <ChevronRight size={20} color={colors.textMuted} aria-hidden />
      </View>
      <View className="h-1.5 flex-row overflow-hidden rounded-pill bg-outline">
        <View className="h-1.5 rounded-pill bg-accent" style={{ width: `${(done / total) * 100}%` }} />
      </View>
    </Pressable>
  );
}
