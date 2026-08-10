import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "@/constants/theme";
import { ONBOARDING_STEPS, stepIndex, stepProgressLabel, type OnboardingStepId } from "@/lib/onboardingSteps";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  id: OnboardingStepId;
  title: string;
  lede: string;
  /** How the shop leaves this step backwards. Every step has one. */
  onBack: () => void;
  backLabel: string;
  children: ReactNode;
  /** The action zone. Exactly one primary control belongs here. */
  footer: ReactNode;
  /** Set on the map step, which fills the screen instead of scrolling. */
  fill?: boolean;
};

/**
 * One step of opening a shop account.
 *
 * The header is the whole progress model: which step this is, how many are
 * left, and a way back that does not throw away what was typed. The bar is
 * monochrome on purpose — the design system permits an active step to take
 * yellow, but every one of these screens already spends its yellow on the one
 * action it wants pressed, and two yellows on a screen teach the eye nothing.
 *
 * The step number is the information; the bar is how far along it is.
 */
export function OnboardingStep({
  id,
  title,
  lede,
  onBack,
  backLabel,
  children,
  footer,
  fill,
}: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const index = stepIndex(id);

  return (
    <View className="gg-screen">
      {/* Inset and design spacing stack — the notch is a keep-out zone, not a gap. */}
      <View style={{ paddingTop: insets.top + spacing.sm }} className="gg-page pb-3">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            className="gg-touch -ml-2 items-center justify-center"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
          </Pressable>
          <Text className="text-overline text-text-muted">{stepProgressLabel(id)}</Text>
        </View>

        <View
          className="mt-3 flex-row gap-1"
          accessibilityRole="progressbar"
          accessibilityLabel={stepProgressLabel(id)}
          accessibilityValue={{ min: 1, max: ONBOARDING_STEPS.length, now: index + 1 }}
        >
          {ONBOARDING_STEPS.map((step, position) => (
            <View
              key={step.id}
              className={
                position <= index
                  ? "h-1 flex-1 rounded-pill bg-accent"
                  : "h-1 flex-1 rounded-pill bg-outline"
              }
            />
          ))}
        </View>
      </View>

      <View className={fill ? "flex-1" : "gg-page flex-1"}>
        <View className={fill ? "gg-page pb-2" : "pb-2"}>
          <Text className="text-h1 text-text-primary">{title}</Text>
          <Text className="mt-2 text-body-lg text-text-secondary">{lede}</Text>
        </View>
        {children}
      </View>

      <View
        className="gg-page gap-3 pt-4"
        style={{ paddingBottom: insets.bottom + spacing.lg }}
      >
        {footer}
      </View>
    </View>
  );
}
