import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import {
  dayDetail,
  monthTally,
  stateLabel,
  type CalendarDay,
  type DayState,
} from "@/lib/queueCalendar";

/**
 * The shop's month, as a wall calendar.
 *
 * The composition is the captain's reference: an oversized day numeral, the
 * month beneath it with the year quieter still, the weekday off to the right,
 * then a grid of dots under their weekday letters. What changes is the palette,
 * which is GRIDGO's.
 *
 * Each dot is a gauge rather than a flat colour — it fills from the bottom as
 * the day fills. That is the difference between a calendar that says "busy"
 * and one a shop can plan against: a day at a fifth and a day at four fifths
 * are both "ongoing", and only one of them can take a rush job.
 *
 * It also means the calendar survives greyscale, which the three colours alone
 * would not: an empty ring, a part-filled one and a solid disc are three
 * different shapes before they are three different colours.
 */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function QueueCalendar({
  days,
  month,
  selectedDayKey,
  onSelectDay,
}: {
  days: CalendarDay[];
  /** Any date inside the month being drawn. */
  month: Date;
  selectedDayKey: string | null;
  onSelectDay: (day: CalendarDay) => void;
}) {
  const colors = useThemeColors();

  const headline = useMemo(() => {
    const selected = days.find((day) => day.dayKey === selectedDayKey && day.inMonth);
    const today = days.find((day) => day.isToday);
    return selected ?? today ?? days.find((day) => day.inMonth) ?? null;
  }, [days, selectedDayKey]);

  const headlineDate = headline ? new Date(`${headline.dayKey}T00:00:00`) : month;
  const tally = useMemo(() => monthTally(days), [days]);

  return (
    <View className="gap-6">
      {/*
        The masthead. The numeral is the largest thing on the screen because
        the shop's own question is about a day, not a month — and it takes
        GRIDGO's gold rather than the primary yellow, which is spent on the
        one control a screen is for and is unreadable at this size on white.
      */}
      <View>
        <Text
          className="font-bold"
          // Larger than any step on the scale, which is the point: this is the
          // one number a shop opens the screen for. The size is inline because
          // the type scale deliberately stops at 32.
          style={{ fontSize: 96, lineHeight: 100, letterSpacing: -4, color: colors.brand }}
          accessibilityRole="header"
        >
          {String(headlineDate.getDate()).padStart(2, "0")}
        </Text>

        <View className="mt-1 flex-row items-baseline justify-between gap-3">
          <View>
            <Text className="text-h2 text-text-primary">{MONTHS[headlineDate.getMonth()]}</Text>
            <Text className="text-h3 text-text-muted">{headlineDate.getFullYear()}</Text>
          </View>
          <Text className="text-h3 text-text-secondary">
            {WEEKDAY_NAMES[headlineDate.getDay()]}
          </Text>
        </View>
      </View>

      <View className="gap-2">
        <View className="flex-row">
          {WEEKDAYS.map((letter, index) => (
            <Text
              key={`${letter}-${index}`}
              className="flex-1 text-center text-caption text-text-muted"
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {letter}
            </Text>
          ))}
        </View>

        <View className="flex-row flex-wrap">
          {days.map((day) => (
            <DayDot
              key={day.dayKey}
              day={day}
              selected={day.dayKey === selectedDayKey}
              onPress={() => onSelectDay(day)}
            />
          ))}
        </View>
      </View>

      {/*
        The key, and the month in one line. Without the words this is a grid
        of coloured circles, which is the one thing a status in this product
        may never be.
      */}
      <View className="gap-2">
        <View className="flex-row flex-wrap gap-x-4 gap-y-2">
          {(["vacant", "ongoing", "full", "closed"] as DayState[]).map((state) => (
            <View key={state} className="flex-row items-center gap-2">
              <Dot state={state} fraction={state === "ongoing" ? 0.55 : null} size={12} />
              <Text className="text-caption text-text-secondary">
                {stateLabel(state)}
                {tally[state] ? ` · ${tally[state]}` : ""}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {headline ? (
        <View className="gg-panel gap-1 p-3">
          <Text className="text-body font-medium text-text-primary">
            {WEEKDAY_NAMES[headlineDate.getDay()]} {headlineDate.getDate()}{" "}
            {MONTHS[headlineDate.getMonth()].slice(0, 3)}
          </Text>
          <Text className="text-body text-text-secondary">{dayDetail(headline)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function DayDot({
  day,
  selected,
  onPress,
}: {
  day: CalendarDay;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <View style={{ width: `${100 / 7}%` }} className="items-center py-1">
      <Pressable
        onPress={onPress}
        disabled={!day.inMonth}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: !day.inMonth }}
        // The whole answer, because a screen reader gets no colour at all.
        accessibilityLabel={`${day.day}: ${stateLabel(day.state)}. ${dayDetail(day)}`}
        hitSlop={6}
        className="gg-touch items-center justify-center"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View
          style={{
            // Today keeps the reference's accent ring, which is also the one
            // place on this screen the primary yellow is spent.
            borderWidth: selected || day.isToday ? 2 : 0,
            borderColor: selected ? colors.textPrimary : colors.actionYellow,
            borderRadius: 999,
            padding: 2,
            opacity: day.inMonth ? (day.isPast ? 0.4 : 1) : 0.15,
          }}
        >
          <Dot state={day.state} fraction={day.fraction} size={30} />
        </View>
      </Pressable>
    </View>
  );
}

/**
 * One day, drawn as how full it is.
 *
 * The fill rises from the bottom in proportion to the day's load, so a fifth
 * booked and four fifths booked are visibly different rather than both simply
 * "ongoing". A day with work but no capacity set gets a fixed half — GRIDGO
 * knows something is on it and honestly cannot say how much.
 */
function Dot({
  state,
  fraction,
  size,
}: {
  state: DayState;
  fraction: number | null;
  size: number;
}) {
  const colors = useThemeColors();

  if (state === "closed") {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.outline,
          backgroundColor: colors.surfaceVariant,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* A strike, so "shut" is a shape and not a shade. */}
        <View
          style={{
            width: size * 1.4,
            height: 1.5,
            backgroundColor: colors.textMuted,
            transform: [{ rotate: "-45deg" }],
          }}
        />
      </View>
    );
  }

  const filled = state === "full" ? 1 : state === "ongoing" ? (fraction ?? 0.5) : 0;
  const fill = state === "full" ? colors.error : colors.actionYellow;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: state === "vacant" ? colors.outline : fill,
        backgroundColor: colors.surface,
        overflow: "hidden",
        justifyContent: "flex-end",
      }}
    >
      {filled > 0 ? (
        <View style={{ height: `${Math.min(1, filled) * 100}%`, backgroundColor: fill }} />
      ) : null}
    </View>
  );
}
