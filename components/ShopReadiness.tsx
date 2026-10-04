import { ChevronRight, Circle } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import {
  NO_MATCHABLE_LISTING,
  listingFixTarget,
  listingOwnSteps,
  listingsNeedingWork,
  liveListingCount,
  setupGaps,
  stepsLeftLine,
  stepTarget,
  type Readiness,
  type ReadinessStep,
  type StepTarget,
} from "@/lib/readiness";

/** How many unfinished listings the card names before it points at the board. */
const LISTINGS_SHOWN = 3;

function go(target: StepTarget) {
  router.push(target.href);
}

function StepButton({ target, primary }: { target: StepTarget; primary: boolean }) {
  // Shrink-wrapped: a column of full-width buttons reads as a form to submit,
  // not a list of separate errands.
  return (
    <View className="flex-row">
      {primary ? (
        <PrimaryButton label={target.label} onPress={() => go(target)} />
      ) : (
        <SecondaryButton label={target.label} onPress={() => go(target)} />
      )}
    </View>
  );
}

/**
 * Not ready for new work, and every step that would change that.
 *
 * Driven by `operational` only — see `lib/readiness`. The card names each
 * shop step in GRIDGO's own words with the button that fixes it, and opens
 * "no listing is eligible" into the listings themselves, because that step on
 * its own is a riddle: the fix is always on a particular listing.
 *
 * `takesYellow` gives the first step's button the screen's yellow, for a floor
 * with no job to carry it. Every other button stays charcoal.
 */
export function ShopNotReadyCard({
  readiness,
  listingNames,
  listingCount,
  takesYellow,
}: {
  readiness: Readiness;
  /** catalogItemId → name, from whatever page of the board the screen holds. */
  listingNames: Record<string, string>;
  /** Listings the shop owns, when known; 0 turns the board step into "Add a listing". */
  listingCount?: number;
  takesYellow: boolean;
}) {
  const colors = useThemeColors();
  const steps = readiness.missing;
  const pending = listingsNeedingWork(readiness);

  // With listings to fix, the listings carry the buttons; the board step's own
  // "Open your board" would be a second door to the same room.
  const stepButton = (step: ReadinessStep) =>
    step.code === NO_MATCHABLE_LISTING && pending.length > 0
      ? null
      : stepTarget(step, { listingCount });

  // The yellow goes to the first button on the card, whichever kind it is.
  const firstButtonStep = steps.find(
    (step) => stepButton(step) || (step.code === NO_MATCHABLE_LISTING && pending.length > 0),
  );
  const yellowKey = !firstButtonStep
    ? null
    : stepButton(firstButtonStep)
      ? `step:${firstButtonStep.code}`
      : `listing:${pending[0]?.catalogItemId}`;
  const yellowFor = (key: string) => takesYellow && key === yellowKey;

  return (
    <View className="gg-card gap-4" accessibilityLabel="Not ready for new work">
      <View className="gap-2">
        <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <StatusChip tone="warning" icon="triangle-alert" label="Not ready" />
          <Text className="text-caption text-text-muted">{stepsLeftLine(steps.length)}</Text>
        </View>
        <Text className="text-h3 text-text-primary">
          Clients cannot be matched with your shop yet
        </Text>
      </View>

      {steps.map((step) => {
        const isBoardStep = step.code === NO_MATCHABLE_LISTING;
        const target = stepButton(step);
        return (
          <View key={step.code} className="gap-3 border-t border-outline-subtle pt-4">
            <View className="flex-row items-start gap-3">
              <View className="pt-1">
                <Circle size={12} color={colors.warning} strokeWidth={2.5} aria-hidden />
              </View>
              <Text className="min-w-0 flex-1 text-body text-text-primary">{step.message}</Text>
            </View>
            {target ? (
              <View className="pl-6">
                <StepButton target={target} primary={yellowFor(`step:${step.code}`)} />
              </View>
            ) : null}
            {isBoardStep && pending.length > 0 ? (
              <View className="gap-2 pl-6">
                {pending.slice(0, LISTINGS_SHOWN).map((entry) => (
                  <ListingFix
                    key={entry.catalogItemId}
                    name={listingNames[entry.catalogItemId] || "A listing"}
                    steps={listingOwnSteps(entry)}
                    target={listingFixTarget(entry)}
                    primary={yellowFor(`listing:${entry.catalogItemId}`)}
                  />
                ))}
                {pending.length > LISTINGS_SHOWN ? (
                  <StepButton
                    target={{
                      label: `See ${pending.length - LISTINGS_SHOWN} more on your board`,
                      href: "/(tabs)/catalogues",
                    }}
                    primary={false}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ListingFix({
  name,
  steps,
  target,
  primary,
}: {
  name: string;
  steps: ReadinessStep[];
  target: StepTarget;
  primary: boolean;
}) {
  return (
    <View className="gg-panel gap-2">
      <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
        {name}
      </Text>
      {steps.map((step, index) => (
        <Text key={`${step.code}-${index}`} className="text-caption text-text-secondary">
          {step.message}
        </Text>
      ))}
      <View className="pt-1">
        <StepButton target={target} primary={primary} />
      </View>
    </View>
  );
}

/**
 * Open for new work: one quiet line, because a shop that can be matched has
 * nothing to do about it.
 */
export function ShopReadyLine({ readiness }: { readiness: Readiness }) {
  const live = liveListingCount(readiness);
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
      <StatusChip tone="success" icon="circle-check" label="Open for new work" />
      <Text className="text-caption text-text-muted">
        {live === 1
          ? "Clients can be matched with 1 listing"
          : `Clients can be matched with ${live} listings`}
      </Text>
    </View>
  );
}

/**
 * "Finish your shop setup" — the gaps that do not stop a match.
 *
 * A panel rather than a card, with no status chip and no yellow, so it reads
 * as unfinished paperwork and never as a second "Not ready". The sentence
 * under the title says so in words, for a screen reader and for a shop that
 * has learned to read warnings into anything listed.
 */
export function ShopSetupGaps({ readiness }: { readiness: Readiness }) {
  const colors = useThemeColors();
  const gaps = setupGaps(readiness);
  if (!gaps.length) return null;

  return (
    <View className="gg-panel gap-3">
      <View className="gap-1">
        <Text className="text-body font-medium text-text-primary">Finish your shop setup</Text>
        <Text className="text-caption text-text-muted">
          {readiness.ready
            ? "Clients can already be matched with you. These round out your shop."
            : "These do not decide whether clients can be matched with you."}
        </Text>
      </View>
      {gaps.map(({ step, serviceCount }) => {
        const target = stepTarget(step);
        const detail =
          serviceCount > 1
            ? `${serviceCount} service lines`
            : serviceCount === 1
              ? "1 service line"
              : null;
        const body = (
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-body text-text-secondary">{step.message}</Text>
            {detail || target ? (
              <Text className="text-caption text-text-muted">
                {[detail, target?.label].filter(Boolean).join(". ")}
              </Text>
            ) : null}
          </View>
        );
        if (!target) {
          return (
            <View key={step.code} className="flex-row items-start gap-3 py-1">
              {body}
            </View>
          );
        }
        return (
          <Pressable
            key={step.code}
            onPress={() => go(target)}
            accessibilityRole="button"
            accessibilityLabel={`${step.message} ${target.label}`}
            className="gg-touch flex-row items-center gap-3 py-1"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            {body}
            <ChevronRight size={18} color={colors.textMuted} aria-hidden />
          </Pressable>
        );
      })}
    </View>
  );
}
