import { ChevronLeft } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { KeyboardAvoidingView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FormScrollView } from "@/components/FormScrollView";
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
  /** Spacing the step's own content wants inside the scroll view. */
  contentClassName?: string;
  /** Drawn over the whole step, not inside its scroll — a busy scrim. */
  overlay?: ReactNode;
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
 *
 * The shell owns the scroll view rather than each step declaring its own: the
 * action is pinned below it, so the two have to agree about the keyboard, and
 * four steps agreeing separately is four chances to disagree.
 *
 * That keyboard agreement is the one place this component splits in two, and
 * the split follows the layout rather than the platform:
 *
 * - A scrolling step keeps its footer where it is and lets it ride up on the
 *   keyboard, so the action stays pressable without dismissing anything. The
 *   scroll view is told how tall that footer is, so the field being typed into
 *   clears the button as well as the keyboard.
 * - The map step has no scroll view to move — the map *is* the content — so the
 *   whole area shortens instead and the map gives up the space.
 */
export function OnboardingStep({
  id,
  title,
  lede,
  onBack,
  backLabel,
  children,
  footer,
  contentClassName,
  overlay,
  fill,
}: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const index = stepIndex(id);
  const [footerHeight, setFooterHeight] = useState(0);

  const onFooterLayout = (event: LayoutChangeEvent) =>
    setFooterHeight(event.nativeEvent.layout.height);

  const footerBlock = (
    <View
      className="gg-page gap-3 pt-4"
      style={{ paddingBottom: insets.bottom + spacing.lg }}
      onLayout={onFooterLayout}
    >
      {footer}
    </View>
  );

  const heading = (
    <View className={fill ? "gg-page pb-2" : "pb-2"}>
      <Text className="text-h1 text-text-primary">{title}</Text>
      <Text className="mt-2 text-body-lg text-text-secondary">{lede}</Text>
    </View>
  );

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

      {fill ? (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View className="flex-1">
            {heading}
            {children}
          </View>
          {footerBlock}
        </KeyboardAvoidingView>
      ) : (
        <>
          <View className="gg-page flex-1">
            {heading}
            <FormScrollView
              contentClassName={contentClassName ?? "pb-4 pt-4"}
              // The footer floats over the last of the content once it rides
              // the keyboard, so the caret has to clear the button too — minus
              // the home-indicator padding the sticky offset gives back.
              bottomOffset={Math.max(footerHeight - insets.bottom, 0) + spacing.md}
            >
              {children}
            </FormScrollView>
          </View>
          {/*
            `opened` hands back the safe-area padding: the home indicator is
            under the keyboard while it is up, so reserving room for it there
            would leave a strip of nothing between the button and the keys.
          */}
          <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
            {footerBlock}
          </KeyboardStickyView>
        </>
      )}

      {overlay}
    </View>
  );
}
