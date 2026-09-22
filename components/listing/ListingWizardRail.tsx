import { Pressable, ScrollView, Text, View } from "react-native";

import {
  WIZARD_STEPS,
  wizardStepIndex,
  type WizardStepId,
} from "@/lib/listingWizard";

type Props = {
  current: WizardStepId;
  /** Furthest step the shop has opened after Proceed from Pick. */
  furthest: WizardStepId;
  /** After the first persist, later steps can be opened. The rail still names every stage on Pick. */
  committed: boolean;
  /** When true, the next step may be tapped without pressing Proceed. */
  currentCanProceed: boolean;
  onSelect: (step: WizardStepId) => void;
};

/**
 * Progress across the add-a-listing interview.
 *
 * Current step takes the yellow underline — the one yellow the rail is allowed.
 * Completed steps go back. Future steps stay visible and only the next one
 * unlocks once this step's proceed rules pass.
 */
export function ListingWizardRail({
  current,
  furthest,
  committed,
  currentCanProceed,
  onSelect,
}: Props) {
  const currentIndex = wizardStepIndex(current);
  const furthestIndex = wizardStepIndex(furthest);

  return (
    <View className="border-b border-outline-subtle bg-surface">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel="Add a listing steps"
      >
        <View className="flex-row px-4">
          {WIZARD_STEPS.map((step, index) => {
            const selected = step.id === current;
            const completed = committed && index < currentIndex;
            const nextUnlock =
              committed && index === currentIndex + 1 && currentCanProceed;
            const reached = committed && index <= furthestIndex;
            const tappable = completed || nextUnlock || (reached && index < currentIndex);
            const labelClass = selected
              ? "text-caption font-medium text-text-primary"
              : tappable
                ? "text-caption text-text-secondary"
                : "text-caption text-text-muted";

            return (
              <Pressable
                key={step.id}
                onPress={tappable && !selected ? () => onSelect(step.id) : undefined}
                disabled={!tappable || selected}
                accessibilityRole="tab"
                accessibilityState={{ selected, disabled: !tappable || selected }}
                accessibilityLabel={step.label}
                className="gg-touch items-center justify-center px-3"
              >
                <Text className={labelClass}>{step.label}</Text>
                <View
                  className={
                    selected
                      ? "mt-1 h-0.5 w-full bg-action-yellow"
                      : "mt-1 h-0.5 w-full bg-transparent"
                  }
                />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
