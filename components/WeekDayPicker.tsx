import { useState } from "react";
import { PixelRatio, Pressable, Text, View } from "react-native";

import { WEEKDAYS } from "@/lib/shopHours";

type Props = {
  /** Open weekdays, GRIDGO numbering (0 is Sunday). */
  days: number[];
  onChange: (days: number[]) => void;
  /** Today's weekday, marked under its day. */
  today: number;
  disabled?: boolean;
};

/** A day is a 44pt touch target, and wider when the text size needs it to fit "Closed". */
const MIN_DAY_WIDTH = 44;
const CLOSED_WIDTH = 40;
/** Seven 44pt days fit a phone's card only with a 2pt gap between them. */
const GAP = 2;

/**
 * The shop's week, Monday first: an open day is ink with "Open" under its
 * name, a closed one is outlined with "Closed". Each day is a toggle, so the
 * week is set the way a shop says it — "we open Monday to Saturday" — and the
 * word under each day keeps it readable without the fill. When seven days do
 * not fit at the phone's text size, the week wraps to two rows rather than
 * cutting the words.
 */
export function WeekDayPicker({ days, onChange, today, disabled = false }: Props) {
  const [width, setWidth] = useState(0);
  const needed = Math.max(MIN_DAY_WIDTH, CLOSED_WIDTH * PixelRatio.getFontScale());
  const perRow = Math.floor((width - GAP * 6) / 7) >= needed ? 7 : 4;
  // Rounded down: seven widths that add up to the row exactly wrap the last day on rounding.
  const dayWidth = width ? Math.floor((width - GAP * (perRow - 1)) / perRow) : undefined;

  return (
    <View
      className="flex-row flex-wrap gap-0.5"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {WEEKDAYS.map((day) => {
        const open = days.includes(day.weekday);
        return (
          <Pressable
            key={day.weekday}
            disabled={disabled}
            onPress={() =>
              onChange(open ? days.filter((d) => d !== day.weekday) : [...days, day.weekday].sort((a, b) => a - b))
            }
            accessibilityRole="switch"
            accessibilityState={{ checked: open, disabled }}
            accessibilityLabel={`${day.long}${day.weekday === today ? ", today" : ""}`}
            accessibilityHint={open ? "Open. Tap to close this day." : "Closed. Tap to open this day."}
            className={
              open
                ? "gg-touch items-center gap-1 rounded-field bg-accent px-0.5 py-2.5"
                : "gg-touch items-center gap-1 rounded-field border border-outline bg-surface px-0.5 py-2.5"
            }
            style={({ pressed }) => ({
              width: dayWidth,
              flexGrow: dayWidth ? 0 : 1,
              opacity: pressed ? 0.7 : disabled ? 0.38 : 1,
            })}
          >
            <Text
              className={open ? "text-body font-bold text-accent-on" : "text-body font-medium text-text-secondary"}
              numberOfLines={1}
            >
              {day.short}
            </Text>
            <Text className={open ? "text-caption text-accent-on" : "text-caption text-text-muted"} numberOfLines={1}>
              {open ? "Open" : "Closed"}
            </Text>
            <View
              className={
                day.weekday !== today ? "h-1 w-4" : open ? "h-1 w-4 rounded-pill bg-accent-on" : "h-1 w-4 rounded-pill bg-text-muted"
              }
            />
          </Pressable>
        );
      })}
    </View>
  );
}
