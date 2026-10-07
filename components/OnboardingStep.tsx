import { useState, type ReactNode } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FormScrollView } from "@/components/FormScrollView";
import { spacing } from "@/constants/theme";
import { ONBOARDING_STEPS, stepIndex, stepProgressLabel, type OnboardingStepId } from "@/lib/onboardingSteps";

type Props = {
  id: OnboardingStepId;
  title: string;
  lede: string;
  children: ReactNode;
  /** The action zone. Exactly one primary control belongs here. Omit when the step owns its own. */
  footer?: ReactNode;
  /** Spacing the step's own content wants inside the scroll view. */
  contentClassName?: string;
  /** Drawn over the whole step, not inside its scroll — a busy scrim. */
  overlay?: ReactNode;
  /** Set on the map step, whose picker owns its horizontal padding. */
  fill?: boolean;
};

/**
 * One step of opening a shop account.
 *
 * The stack header owns the way back — a native chevron, never a drawn control.
 * What remains here is the progress model: which step this is, how many are
 * left, and why GRIDGO is asking. The bar is monochrome on purpose — the design
 * system permits an active step to take yellow, but every one of these screens
 * already spends its yellow on the one action it wants pressed.
 *
 * The shell owns the scroll view rather than each step declaring its own: the
 * action is pinned below it, so the two have to agree about the keyboard, and
 * four steps agreeing separately is four chances to disagree.
 *
 * Every step scrolls its content and keeps its footer above the keyboard.
 * The map reserves its own usable height rather than giving that space away
 * when the keyboard, display zoom or larger text leaves a shorter viewport.
 */
export function OnboardingStep({
  id,
  title,
  lede,
  children,
  footer,
  contentClassName,
  overlay,
  fill,
}: Props) {
  const insets = useSafeAreaInsets();
  const index = stepIndex(id);
  const [footerHeight, setFooterHeight] = useState(0);

  const onFooterLayout = (event: LayoutChangeEvent) =>
    setFooterHeight(event.nativeEvent.layout.height);

  const footerBlock = footer ? (
    <View
      className="gg-page gap-3 bg-canvas pt-4"
      style={{ paddingBottom: insets.bottom + spacing.lg }}
      onLayout={onFooterLayout}
    >
      {footer}
    </View>
  ) : null;

  const heading = (
    <View className={fill ? "gg-page pb-2" : "pb-2"}>
      <Text className="text-overline text-text-muted">{stepProgressLabel(id)}</Text>
      <Text className="mt-2 text-h1 text-text-primary">{title}</Text>
      <Text className="mt-2 text-body-lg text-text-secondary">{lede}</Text>
    </View>
  );

  return (
    <View className="gg-screen">
      <View className="gg-page pb-3 pt-3">
        <View
          className="flex-row gap-1"
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
        <>
          <FormScrollView
            bottomOffset={Math.max(footerHeight - insets.bottom, 0) + spacing.md}
          >
            {heading}
            {children}
          </FormScrollView>
          <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
            {footerBlock}
          </KeyboardStickyView>
        </>
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
