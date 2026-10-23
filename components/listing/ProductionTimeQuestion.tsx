import { ChevronDown, ChevronUp, TriangleAlert } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { Stepper } from "@/components/controls/Stepper";
import { ProductionTimePreviewPanel } from "@/components/listing/ProductionTimePreviewPanel";
import { SpeedTierEditor } from "@/components/listing/TierEditor";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import type { Listing, SpeedTier } from "@/lib/listings";
import { heldMixedRange, sameSpeedTiers } from "@/lib/listingDraft";
import { applyProductionTimeToAll, BOARD_NOT_OPEN_YET, loadListingCount } from "@/lib/listingsApi";
import {
  DEFAULT_DAY_MINUTES,
  DEFAULT_DAYS_CHOICE,
  DEFAULT_SAME_DAY_CHOICE,
  PRODUCTION_DAYS,
  PRODUCTION_TIME_REVIEW_TITLE,
  choiceLine,
  choiceProblem,
  readyInLine,
  reviewLines,
  sameDay,
  sameDayLadder,
  sameDayPastOneDay,
  timeParts,
  type ProductionChoice,
  type ProductionChoiceMode,
} from "@/lib/productionDays";
import { askConfirm } from "@/store/sheets";

const MODES = [
  { value: "same_day", label: "Same day" },
  { value: "days", label: "Days" },
] as const;

function daysUnit(days: number): string {
  return days === 1 ? "working day" : "working days";
}

/**
 * "How long does this take?" — Same day, ready in a number of hours, or Days,
 * from one number of working days to another. The one production-time
 * question, on the listing editor and the add-a-listing wizard alike, in the
 * same words as the shop web dashboard.
 *
 * Switching the mode and back restores what the shop had there, so a look at
 * the other one costs nothing. Unanswered, neither mode is selected until the
 * shop picks one: a listing with no production time at all, or one holding an
 * older range that mixes hours and working days (`heldLine`), which keeps
 * setting the dates until then. A bad answer reads the dashboard's sentence
 * for it under the steppers.
 */
export function ProductionTimeQuestion({
  choice,
  heldLine,
  onChange,
  dayMinutes = DEFAULT_DAY_MINUTES,
  disabled,
}: {
  choice: ProductionChoice | null;
  /** "Ready in 2 hours to 2 working days": an older range neither answer holds. */
  heldLine?: string | null;
  onChange: (choice: ProductionChoice) => void;
  dayMinutes?: number;
  disabled?: boolean;
}) {
  const last = useRef<Partial<Record<ProductionChoiceMode, ProductionChoice>>>({});

  function switchTo(mode: ProductionChoiceMode) {
    if (choice?.mode === mode) return;
    if (choice) last.current[choice.mode] = choice;
    onChange(last.current[mode] ?? (mode === "same_day" ? DEFAULT_SAME_DAY_CHOICE : DEFAULT_DAYS_CHOICE));
  }

  return (
    <View className="gap-3">
      <Text className="text-body-lg font-medium text-text-primary">How long does this take?</Text>
      <SegmentedControl
        options={MODES}
        value={choice?.mode ?? null}
        onChange={switchTo}
        accessibilityLabel="How long does this take?"
        disabled={disabled}
      />
      {choice?.mode === "same_day" ? (
        <View className="gap-2">
          <Text className="text-caption text-text-secondary">Ready in</Text>
          {(() => {
            const ladder = sameDayLadder(dayMinutes, choice.minutes);
            return (
              <Stepper
                value={Math.max(0, ladder.indexOf(choice.minutes))}
                onChange={(index) => onChange({ mode: "same_day", minutes: ladder[index] })}
                min={0}
                max={ladder.length - 1}
                display={timeParts(sameDay(choice.minutes))}
                accessibilityLabel="Hours until ready"
                disabled={disabled}
              />
            );
          })()}
          <Text className="text-caption text-text-muted">
            Counted in your open hours. A job that runs past closing finishes the next working day.
          </Text>
        </View>
      ) : choice?.mode === "days" ? (
        <View className="gap-2">
          <Text className="text-caption text-text-secondary">From</Text>
          <Stepper
            value={choice.minDays}
            // Raising the first past the second carries the second with it.
            onChange={(minDays) => onChange({ mode: "days", minDays, maxDays: Math.max(minDays, choice.maxDays) })}
            min={PRODUCTION_DAYS.min}
            max={PRODUCTION_DAYS.max}
            display={{ value: String(choice.minDays), unit: daysUnit(choice.minDays) }}
            accessibilityLabel="Shortest working days"
            disabled={disabled}
          />
          <Text className="text-caption text-text-secondary">To</Text>
          <Stepper
            value={choice.maxDays}
            onChange={(maxDays) => onChange({ mode: "days", minDays: Math.min(choice.minDays, maxDays), maxDays })}
            min={PRODUCTION_DAYS.min}
            max={PRODUCTION_DAYS.max}
            display={{ value: String(choice.maxDays), unit: daysUnit(choice.maxDays) }}
            accessibilityLabel="Longest working days"
            disabled={disabled}
          />
        </View>
      ) : heldLine ? (
        <View className="gap-1">
          <Text className="text-body text-text-primary">
            Now: {heldLine}
          </Text>
          <Text className="text-caption text-text-secondary">
            This older setting mixes hours and working days, so it fits neither answer. It still sets the dates
            clients are offered. Choosing an answer changes them from now on; orders already placed keep their dates.
          </Text>
        </View>
      ) : (
        <Text className="text-caption text-text-secondary">
          No production time yet, so clients cannot be offered a date. Pick one.
        </Text>
      )}
      {choice && choiceProblem(choice, dayMinutes) ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {choiceProblem(choice, dayMinutes)}
        </Text>
      ) : sameDayPastOneDay(choice, dayMinutes) ? (
        <Text className="text-caption text-text-secondary">
          This is one working day of open hours or more. GRIDGO keeps it exactly, so the work is ready on a later
          working day; the dates below show when.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * GRIDGO's "Check your production time" on a listing it flagged. It clears
 * when the shop saves an answer — changed, or kept with "Keep 1 working day",
 * which saves the time the listing already holds — and not on any other save.
 */
export function ProductionTimeReminder({
  listing,
  held,
  touched,
  onKeep,
  dayMinutes,
}: {
  listing: Listing;
  /** The answer GRIDGO holds for the listing, if it has a usable one. */
  held: ProductionChoice | null;
  /** The shop has already answered on this screen; saving will clear it. */
  touched: boolean;
  /** Saves `held` as it is. Left out where there is nothing to keep yet. */
  onKeep?: (held: ProductionChoice) => Promise<void>;
  dayMinutes?: number;
}) {
  const colors = useThemeColors();
  const [keeping, setKeeping] = useState(false);
  const review = listing.productionTimeReview;
  if (!review?.required) return null;
  const keepable = held && !choiceProblem(held, dayMinutes) ? held : null;

  async function keep(choice: ProductionChoice) {
    if (!onKeep) return;
    setKeeping(true);
    try {
      await onKeep(choice);
    } finally {
      setKeeping(false);
    }
  }
  return (
    <View className="gg-panel gap-2 border border-warning p-3" accessibilityRole="alert">
      <View className="flex-row items-center gap-2">
        <TriangleAlert size={18} color={colors.warning} strokeWidth={2} />
        <Text className="flex-1 text-body font-medium text-text-primary">{PRODUCTION_TIME_REVIEW_TITLE}</Text>
      </View>
      {reviewLines(review).map((line) => (
        <Text key={line} className="text-body text-text-secondary">
          {line}
        </Text>
      ))}
      {touched ? (
        <Text className="text-caption text-text-muted">Save to confirm it. This reminder then goes away.</Text>
      ) : keepable && onKeep ? (
        <SecondaryButton
          label={`Keep ${choiceLine(keepable)}`}
          onPress={() => void keep(keepable)}
          disabled={keeping}
        />
      ) : null}
    </View>
  );
}

/**
 * The same reminder near the top of a long listing screen, with the way to
 * it: "Check production time" brings the question into view. Drawn only while
 * GRIDGO asks.
 */
export function ProductionTimeCheckJump({ listing, onCheck }: { listing: Listing; onCheck: () => void }) {
  const colors = useThemeColors();
  if (!listing.productionTimeReview?.required) return null;
  return (
    <View className="gg-panel gap-2 border border-warning p-3">
      <View className="flex-row items-center gap-2">
        <TriangleAlert size={18} color={colors.warning} strokeWidth={2} />
        <Text className="flex-1 text-body font-medium text-text-primary">{PRODUCTION_TIME_REVIEW_TITLE}</Text>
      </View>
      <SecondaryButton label="Check production time" onPress={onCheck} />
    </View>
  );
}

/**
 * Under "More options": "Use for all my listings" and the faster price
 * options (the tier editor, kept exactly as it was, only moved).
 *
 * "Use for all my listings" asks first — naming how many listings when GRIDGO
 * says — saves this screen's own changes (`beforeApply`), then sets the answer
 * on every listing the shop owns.
 */
export function ProductionTimeMoreOptions({
  choice,
  speedTiers,
  unitLabel,
  onSpeedTiersChange,
  dayMinutes,
  disabled,
  beforeApply,
  afterApply,
}: {
  choice: ProductionChoice | null;
  speedTiers: SpeedTier[];
  unitLabel: string;
  onSpeedTiersChange: (next: SpeedTier[]) => void;
  dayMinutes?: number;
  disabled?: boolean;
  beforeApply: () => Promise<boolean>;
  afterApply: () => Promise<void>;
}) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [listingCount, setListingCount] = useState<number | null>(null);
  const Chevron = open ? ChevronUp : ChevronDown;
  const problem = choice ? choiceProblem(choice, dayMinutes) : null;

  useEffect(() => {
    if (!open) return;
    let live = true;
    void loadListingCount().then((count) => {
      if (live) setListingCount(count);
    });
    return () => {
      live = false;
    };
  }, [open]);

  async function applyToAll() {
    if (!choice) return;
    const confirmed = await askConfirm(
      {
        question: `Use ${choiceLine(choice)} for all your listings?`,
        consequence: `${listingCount != null ? `All ${listingCount} of your listings` : "Every listing you have"}, hidden ones and drafts included, will take this production time. New orders get dates from it straight away. Orders already placed keep their dates, and your prices and faster options do not change.`,
        confirmLabel: "Use for all",
        cancelLabel: "Cancel",
      },
      "/shop/confirm",
    );
    if (!confirmed) return;
    setApplying(true);
    setResult(null);
    try {
      if (!(await beforeApply())) return;
      const outcome = await applyProductionTimeToAll(choice);
      await afterApply();
      setResult(
        outcome.status === "ok"
          ? {
              ok: true,
              text: `Done. ${outcome.value === 1 ? "Your listing takes" : `All ${outcome.value} listings take`} ${choiceLine(choice)} now.`,
            }
          : { ok: false, text: outcome.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : outcome.message },
      );
    } finally {
      setApplying(false);
    }
  }

  return (
    <View className="gap-3">
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="gg-touch flex-row items-center gap-3 py-2"
      >
        <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">More options</Text>
        <Chevron size={20} color={colors.textSecondary} strokeWidth={2} />
      </Pressable>
      {open ? (
        <View className="gap-4">
          <View className="gap-2 rounded-field border border-outline p-3">
            <Text className="text-body font-medium text-text-primary">Use for all my listings</Text>
            {choice ? (
              <Text className="text-caption text-text-secondary">
                Puts this answer ({choiceLine(choice)}) on every listing you have, hidden ones and drafts included.
                Prices and faster options stay as they are.
              </Text>
            ) : null}
            <SecondaryButton
              label={applying ? "Applying…" : "Use for all my listings"}
              onPress={() => void applyToAll()}
              disabled={!choice || Boolean(problem) || disabled || applying}
            />
            {result ? (
              <Text
                className={`text-caption ${result.ok ? "text-text-secondary" : "text-error"}`}
                accessibilityRole={result.ok ? undefined : "alert"}
                accessibilityLiveRegion="polite"
              >
                {result.text}
              </Text>
            ) : null}
          </View>
          <View className="gap-2 rounded-field border border-outline p-3">
            <Text className="text-body font-medium text-text-primary">Faster price options</Text>
            <Text className="text-caption text-text-muted">
              A client sees these as Rush, costs more on dates only a faster option reaches.
            </Text>
            <SpeedTierEditor tiers={speedTiers} unitLabel={unitLabel} dayMinutes={dayMinutes} onChange={onSpeedTiersChange} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The whole production-time section a listing screen draws. */
export function ProductionTimeSection({
  listing,
  unitLabel,
  held,
  choice,
  touched,
  onChange,
  onKeep,
  speedTiers,
  onSpeedTiersChange,
  disabled,
  beforeApply,
  afterApply,
}: {
  /** The listing as GRIDGO holds it: its reminder, its id for the preview. */
  listing: Listing;
  /** The answer GRIDGO holds, for the reminder's "Keep". */
  held?: ProductionChoice | null;
  choice: ProductionChoice | null;
  touched: boolean;
  onChange: (choice: ProductionChoice) => void;
  onKeep?: (held: ProductionChoice) => Promise<void>;
  speedTiers: SpeedTier[];
  unitLabel: string;
  onSpeedTiersChange: (next: SpeedTier[]) => void;
  disabled?: boolean;
  beforeApply: () => Promise<boolean>;
  afterApply: () => Promise<void>;
}) {
  const dayMinutes = listing.productionDayMinutes ?? undefined;
  const mixed = heldMixedRange(listing);
  return (
    <View className="gap-4">
      <ProductionTimeReminder
        listing={listing}
        held={held ?? null}
        touched={touched}
        onKeep={onKeep}
        dayMinutes={dayMinutes}
      />
      <ProductionTimeQuestion
        choice={choice}
        heldLine={mixed ? readyInLine(mixed.max, mixed.min) : null}
        onChange={onChange}
        dayMinutes={dayMinutes}
        disabled={disabled}
      />
      {choice ? (
        <ProductionTimePreviewPanel
          listing={listing}
          choice={choice}
          problem={choiceProblem(choice, dayMinutes)}
          tiersUnsaved={!sameSpeedTiers(speedTiers, listing.speedTiers)}
        />
      ) : null}
      <ProductionTimeMoreOptions
        choice={choice}
        unitLabel={unitLabel}
        speedTiers={speedTiers}
        onSpeedTiersChange={onSpeedTiersChange}
        dayMinutes={dayMinutes}
        disabled={disabled}
        beforeApply={beforeApply}
        afterApply={afterApply}
      />
    </View>
  );
}
