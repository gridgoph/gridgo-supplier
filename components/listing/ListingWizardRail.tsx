import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View, type LayoutRectangle } from "react-native";

import {
  WIZARD_STEPS,
  wizardStepIndex,
  type WizardStepId,
} from "@/lib/listingWizard";

/** The rail's own side padding (`px-2`), kept clear when scrolling to a step. */
const RAIL_GUTTER = 8;

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
 *
 * Seven labels fit across a 390pt phone. On a narrower one, or with larger
 * text, the rail scrolls — so it keeps the current step and the one after it
 * in view itself, rather than leaving "Review" clipped at the edge of the step
 * the shop is standing on.
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
  const scrollRef = useRef<ScrollView>(null);
  const [railWidth, setRailWidth] = useState(0);
  const [frames, setFrames] = useState<Partial<Record<WizardStepId, LayoutRectangle>>>({});

  useEffect(() => {
    const here = frames[current];
    if (!here || !railWidth) return;
    const next = frames[WIZARD_STEPS[currentIndex + 1]?.id ?? current] ?? here;
    // Bring the right edge of the next step (or this one, on Review) into view;
    // never scroll past the start of the current one.
    const x = Math.min(here.x, next.x + next.width - railWidth + RAIL_GUTTER);
    scrollRef.current?.scrollTo({ x: Math.max(0, x), animated: true });
  }, [current, currentIndex, frames, railWidth]);

  return (
    <View className="border-b border-outline-subtle bg-surface">
      <ScrollView
        ref={scrollRef}
        onLayout={(event) => setRailWidth(event.nativeEvent.layout.width)}
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel="Add a listing steps"
      >
        <View className="flex-row px-2">
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
                onLayout={(event) => {
                  const frame = event.nativeEvent.layout;
                  setFrames((known) => ({ ...known, [step.id]: frame }));
                }}
                className="gg-touch items-center justify-center px-2"
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
