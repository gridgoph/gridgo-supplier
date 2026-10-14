import { CalendarDays, Clock } from "lucide-react-native";
import { useRef } from "react";
import { Text, View } from "react-native";

import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { Stepper } from "@/components/controls/Stepper";
import { useThemeColors } from "@/hooks/useTheme";
import {
  DEFAULT_DAY_MINUTES,
  DEFAULT_SAME_DAY,
  clampWindow,
  readyExampleLine,
  sameTime,
  timeLadder,
  timeMinutes,
  timeParts,
  workingDays,
  type ProductionTime,
} from "@/lib/productionDays";

/** Shown under the section title wherever a shop sets production time. */
export const PRODUCTION_TIME_HINT =
  "Hours for work you finish the same day, working days for anything longer. Both count only your shop's open hours.";

type Unit = ProductionTime["unit"];

const UNITS = [
  { value: "hours", label: "Hours" },
  { value: "days", label: "Working days" },
] as const;

/** Where a unit switch lands the first time: one hour, or one working day. */
function startOf(unit: Unit): ProductionTime {
  return unit === "hours" ? DEFAULT_SAME_DAY : workingDays(1);
}

function UnitSwitch({ unit, onChange, label }: { unit: Unit; onChange: (unit: Unit) => void; label: string }) {
  return (
    <SegmentedControl options={UNITS} value={unit} onChange={onChange} accessibilityLabel={label} />
  );
}

/**
 * One production time on a stepper. The steps run half hour by half hour to
 * the end of a working day and carry on in working days, so "−" from one
 * working day is 9½ hours rather than a wall.
 */
export function ProductionTimeStepper({
  time,
  onChange,
  dayMinutes = DEFAULT_DAY_MINUTES,
  accessibilityLabel,
  disabled,
}: {
  time: ProductionTime;
  onChange: (time: ProductionTime) => void;
  dayMinutes?: number;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const ladder = timeLadder(dayMinutes, time);
  const index = Math.max(0, ladder.findIndex((step) => sameTime(step, time)));
  return (
    <Stepper
      value={index}
      onChange={(next) => onChange(ladder[next])}
      min={0}
      max={ladder.length - 1}
      display={timeParts(time)}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
    />
  );
}

/**
 * A single production time with its unit: a speed tier, or a category line's
 * usual time. Switching the unit lands on where the shop last was in it.
 */
export function ProductionTimePicker({
  time,
  onChange,
  dayMinutes,
  accessibilityLabel,
  unitLabel,
  disabled,
}: {
  time: ProductionTime;
  onChange: (time: ProductionTime) => void;
  dayMinutes?: number;
  accessibilityLabel: string;
  /** Names the hours / working days switch, distinct from any other on the screen. */
  unitLabel: string;
  disabled?: boolean;
}) {
  const last = useRef<Partial<Record<Unit, ProductionTime>>>({});
  function switchTo(unit: Unit) {
    if (unit === time.unit) return;
    last.current[time.unit] = time;
    onChange(last.current[unit] ?? startOf(unit));
  }
  return (
    <View className="gap-2">
      <UnitSwitch unit={time.unit} onChange={switchTo} label={unitLabel} />
      <ProductionTimeStepper
        time={time}
        onChange={onChange}
        dayMinutes={dayMinutes}
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
      />
    </View>
  );
}

type Props = {
  min: ProductionTime;
  max: ProductionTime;
  onChange: (window: { min: ProductionTime; max: ProductionTime }) => void;
  /** The shop's working day, from GRIDGO; its default ten hours when not sent. */
  dayMinutes?: number;
  /** Fixed in tests; a shop always sees today. */
  now?: Date;
};

/**
 * The soonest and latest a listing takes — in hours for a same-day job, in
 * working days for longer work — with the moment a job started now would be
 * ready, so "2" reads as Thursday, and "1 hour" at half past five reads as
 * the next morning. Both steppers keep the pair in order: raising the soonest
 * past the latest carries the latest with it.
 *
 * The unit is the latest's. Switching it moves both ends, and switching back
 * restores the window the shop had there, so a look at the other unit costs
 * nothing.
 */
export function ProductionTimeField({ min, max, onChange, dayMinutes = DEFAULT_DAY_MINUTES, now }: Props) {
  const colors = useThemeColors();
  const window = clampWindow(min, max, dayMinutes);
  const unit = window.max.unit;
  const last = useRef<Partial<Record<Unit, { min: ProductionTime; max: ProductionTime }>>>({});

  function switchTo(next: Unit) {
    if (next === unit) return;
    last.current[unit] = window;
    const start = startOf(next);
    onChange(last.current[next] ?? { min: start, max: start });
  }

  const Icon = unit === "hours" ? Clock : CalendarDays;
  return (
    <View className="gap-3">
      <UnitSwitch unit={unit} onChange={switchTo} label="Count production time in" />
      <View className="gap-2">
        <Text className="text-caption text-text-secondary">Soonest</Text>
        <ProductionTimeStepper
          time={window.min}
          dayMinutes={dayMinutes}
          onChange={(value) =>
            // Raising the soonest past the latest carries the latest with it.
            onChange(
              timeMinutes(value, dayMinutes) > timeMinutes(window.max, dayMinutes)
                ? { min: value, max: value }
                : { min: value, max: window.max },
            )
          }
          accessibilityLabel="Soonest production time"
        />
      </View>
      <View className="gap-2">
        <Text className="text-caption text-text-secondary">Latest</Text>
        <ProductionTimeStepper
          time={window.max}
          dayMinutes={dayMinutes}
          onChange={(value) =>
            // Lowering the latest under the soonest brings the soonest down with it.
            onChange(
              timeMinutes(window.min, dayMinutes) > timeMinutes(value, dayMinutes)
                ? { min: value, max: value }
                : { min: window.min, max: value },
            )
          }
          accessibilityLabel="Latest production time"
        />
      </View>
      <View className="gg-panel flex-row gap-3 p-3" accessibilityRole="summary">
        <Icon size={18} color={colors.textSecondary} strokeWidth={2} />
        <View className="flex-1 gap-1">
          <Text className="text-body text-text-primary">
            {readyExampleLine(window.min, window.max, now ?? new Date())}
          </Text>
          <Text className="text-caption text-text-muted">
            {unit === "hours"
              ? "Hours count only while you are open, so a job that runs past closing finishes the next working day. Jobs already ahead of it can push it later."
              : "Days you are closed don’t count. Jobs already ahead of it can push it later."}
          </Text>
        </View>
      </View>
    </View>
  );
}
