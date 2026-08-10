import {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { CalendarDays } from "lucide-react-native";
import { Platform, Pressable, Text } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { askDate } from "@/store/sheets";

type Mode = "date" | "datetime";

type Props = {
  value: Date | null;
  onChange: (value: Date) => void;
  mode?: Mode;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Shown when nothing is chosen yet. Never a typed-date example. */
  placeholder?: string;
  accessibilityLabel: string;
  disabled?: boolean;
};

/**
 * A real date (or date and time) picker.
 *
 * Dates are never typed into a text box: the shop taps the field and gets the
 * platform calendar, so `2026-08-12T17:00:00+08:00` is something the app
 * produces rather than something a person has to spell.
 *
 * Android opens its own system dialogs imperatively — date, then clock — which
 * is what a person on that platform expects. Everywhere else the calendar is a
 * presented sheet route (`app/pick-date.tsx`), so it drags down, honours the
 * back gesture, and dims what is behind it without this component drawing an
 * overlay of its own.
 */
export function DateTimeField({
  value,
  onChange,
  mode = "datetime",
  minimumDate,
  maximumDate,
  placeholder = "Choose a date",
  accessibilityLabel,
  disabled,
}: Props) {
  const colors = useThemeColors();
  const shown = value ?? null;

  function openAndroid() {
    const start = value ?? defaultStart(minimumDate);
    DateTimePickerAndroid.open({
      value: start,
      mode: "date",
      minimumDate,
      maximumDate,
      onChange: (event: DateTimePickerEvent, picked?: Date) => {
        if (event.type !== "set" || !picked) return;
        if (mode === "date") {
          onChange(picked);
          return;
        }
        // Chain the clock so a promised finish carries a real time of day.
        DateTimePickerAndroid.open({
          value: picked,
          mode: "time",
          onChange: (timeEvent: DateTimePickerEvent, time?: Date) => {
            if (timeEvent.type !== "set" || !time) return;
            const combined = new Date(picked);
            combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
            onChange(clamp(combined, minimumDate, maximumDate));
          },
        });
      },
    });
  }

  async function open() {
    if (disabled) return;
    if (Platform.OS === "android") {
      openAndroid();
      return;
    }
    const picked = await askDate({
      title: accessibilityLabel,
      mode,
      initial: (value ?? defaultStart(minimumDate)).toISOString(),
      minimum: minimumDate?.toISOString(),
      maximum: maximumDate?.toISOString(),
      confirmLabel: mode === "date" ? "Use this day" : "Use this time",
    });
    if (picked) onChange(clamp(picked, minimumDate, maximumDate));
  }

  return (
    <Pressable
      onPress={() => void open()}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: shown ? formatValue(shown, mode) : placeholder }}
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={
        disabled
          ? "gg-field gg-disabled flex-row items-center justify-between"
          : "gg-field flex-row items-center justify-between"
      }
      style={({ pressed }) => (pressed && !disabled ? { opacity: 0.7 } : undefined)}
    >
      <Text
        className={shown ? "text-body text-text-primary" : "text-body text-text-muted"}
        numberOfLines={1}
      >
        {shown ? formatValue(shown, mode) : placeholder}
      </Text>
      <CalendarDays size={18} color={colors.textMuted} strokeWidth={2} />
    </Pressable>
  );
}

function defaultStart(minimumDate?: Date): Date {
  const now = new Date();
  if (minimumDate && minimumDate > now) return new Date(minimumDate);
  return now;
}

function clamp(value: Date, min?: Date, max?: Date): Date {
  if (min && value < min) return new Date(min);
  if (max && value > max) return new Date(max);
  return value;
}

function formatValue(value: Date, mode: Mode): string {
  if (mode === "date") {
    return value.toLocaleDateString("en-PH", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return value.toLocaleString("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
