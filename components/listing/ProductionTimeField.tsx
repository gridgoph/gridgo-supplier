import { useRef } from "react";
import { View } from "react-native";

import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { Stepper } from "@/components/controls/Stepper";
import {
  DEFAULT_DAY_MINUTES,
  DEFAULT_SAME_DAY,
  sameTime,
  timeLadder,
  timeParts,
  workingDays,
  type ProductionTime,
} from "@/lib/productionDays";

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
