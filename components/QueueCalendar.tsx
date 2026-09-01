import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useReducedMotion } from "react-native-reanimated";

import { fontFamily } from "@/constants/fonts";
import { colors as palette } from "@/constants/theme";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { formatClockTime } from "@/lib/dates";
import {
  calendarPlaceLabel,
  dayDetail,
  dayDiscKind,
  dayDiscLiquid,
  monthTally,
  stateLabel,
  type CalendarDay,
  type DayDiscKind,
  type DayState,
} from "@/lib/queueCalendar";

/**
 * The shop's month, as a wall of dots.
 *
 * Palette is pinned to the captain's board: gold numeral, white month,
 * muted year, weekday and clock on the right, then a 7-wide circle grid.
 * Surrounding chrome stays GRIDGO's. The one risk is the grid itself —
 * every cell is a disc, and a day being worked fills from the bottom like
 * a cup, not a pie.
 *
 *   canvas / black   #000000
 *   gold             actionYellow #FFDE58
 *   closed / past    light error  #C62828
 *   open             white
 *   padding days     surfaceVariant
 *
 * Display is Satoshi-Black on the selected day number only. Everything else
 * stays the UI scale. The liquid surface is a straight line; reduced motion
 * leaves it still.
 */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

const DISC_SIZE = 40;
const RING = 2;

export function QueueCalendar({
  days,
  month,
  selectedDayKey,
  placeLabel,
  onSelectDay,
  onChangeMonth,
}: {
  days: CalendarDay[];
  /** Any date inside the month being drawn. */
  month: Date;
  selectedDayKey: string | null;
  /** Shop pin label, if the shop has given GRIDGO one. Never invented. */
  placeLabel?: string | null;
  onSelectDay: (day: CalendarDay) => void;
  onChangeMonth: (month: Date) => void;
}) {
  const colors = useThemeColors();
  const clock = useTickingClock();
  const place = calendarPlaceLabel(placeLabel);
  const showSeconds = useReducedMotion() !== true;

  const headline = useMemo(() => {
    const selected = days.find((day) => day.dayKey === selectedDayKey && day.inMonth);
    const today = days.find((day) => day.isToday);
    return selected ?? today ?? days.find((day) => day.inMonth) ?? null;
  }, [days, selectedDayKey]);

  const headlineDate = headline ? new Date(`${headline.dayKey}T00:00:00`) : month;
  const tally = useMemo(() => monthTally(days), [days]);
  const clockLine = place
    ? `${formatClockTime(clock, { seconds: showSeconds })} · ${place}`
    : formatClockTime(clock, { seconds: showSeconds });

  return (
    <View className="gap-6">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text
            className="font-black"
            style={{ fontSize: 96, lineHeight: 100, letterSpacing: -4, color: colors.brand }}
            accessibilityRole="header"
            accessibilityLabel={`${WEEKDAY_FULL[headlineDate.getDay()]} ${headlineDate.getDate()} ${MONTHS[headlineDate.getMonth()]} ${headlineDate.getFullYear()}`}
          >
            {String(headlineDate.getDate()).padStart(2, "0")}
          </Text>
          <Text className="text-h2 text-text-primary">{MONTHS[headlineDate.getMonth()]}</Text>
          <Text className="text-body text-text-muted">{headlineDate.getFullYear()}</Text>
        </View>

        <View className="items-end pt-3">
          <Text className="text-h3 text-text-primary">
            {WEEKDAY_NAMES[headlineDate.getDay()]}
          </Text>
          <Text className="text-caption text-text-muted">{clockLine}</Text>
          <View className="mt-6 flex-row items-center">
            <Pressable
              onPress={() =>
                onChangeMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              hitSlop={6}
              className="gg-touch items-center justify-center"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <ChevronLeft size={22} color={colors.textPrimary} strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={() =>
                onChangeMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={6}
              className="gg-touch items-center justify-center"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <ChevronRight size={22} color={colors.textPrimary} strokeWidth={2} />
            </Pressable>
          </View>
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

      <View className="gap-2">
        <View className="flex-row flex-wrap gap-x-4 gap-y-2">
          {(["vacant", "ongoing", "full", "closed"] as DayState[]).map((state) => (
            <View key={state} className="flex-row items-center gap-2">
              <Disc
                kind={legendKind(state)}
                liquid={state === "ongoing" ? 0.55 : null}
                size={12}
              />
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

function legendKind(state: DayState): DayDiscKind {
  switch (state) {
    case "vacant":
      return "open";
    case "ongoing":
      return "progress";
    case "full":
      return "full";
    case "closed":
      return "shut";
  }
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
  const kind = dayDiscKind(day);

  return (
    <View style={{ width: `${100 / 7}%` }} className="items-center py-1">
      <Pressable
        onPress={onPress}
        disabled={!day.inMonth}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: !day.inMonth }}
        accessibilityLabel={`${day.day}: ${stateLabel(day.state)}. ${dayDetail(day)}`}
        hitSlop={6}
        className="gg-touch items-center justify-center"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View
          style={{
            borderWidth: RING,
            borderColor: selected ? colors.actionYellow : "transparent",
            borderRadius: 999,
            padding: 2,
          }}
        >
          <Disc
            kind={kind}
            liquid={dayDiscLiquid(day)}
            size={DISC_SIZE}
            label={String(day.day)}
          />
        </View>
      </Pressable>
    </View>
  );
}

/**
 * One disc. Solid for open / full / shut / padding; a cup of yellow for a
 * day that is only part-booked. The fill is a rectangle clipped by the
 * circle, so its top edge stays a flat liquid line.
 */
function Disc({
  kind,
  liquid,
  size,
  label,
}: {
  kind: DayDiscKind;
  liquid: number | null;
  size: number;
  label?: string;
}) {
  const theme = useThemeName();
  const tokens = useThemeColors();
  const paint = discPaint(kind, theme, tokens, liquid);
  const inner = size - paint.outlineWidth * 2;
  const fillHeight = liquid != null ? inner * liquid : 0;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        borderWidth: paint.outlineWidth,
        borderColor: paint.outline,
        backgroundColor: paint.background,
        overflow: "hidden",
        justifyContent: "flex-end",
      }}
    >
      {liquid != null && fillHeight > 0 ? (
        <View
          testID={label ? `day-liquid-${label}` : undefined}
          style={{ height: fillHeight, width: "100%", backgroundColor: paint.fill }}
        />
      ) : null}
      {label ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: paint.text,
              fontFamily: fontFamily.bold,
              fontSize: Math.round(size * 0.34),
              lineHeight: Math.round(size * 0.4),
              includeFontPadding: false,
            }}
          >
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function discPaint(
  kind: DayDiscKind,
  theme: "light" | "dark",
  tokens: ReturnType<typeof useThemeColors>,
  liquid: number | null,
) {
  const closed = palette.light.error;
  const white = palette.light.surface;
  const onWhite = palette.light.textPrimary;
  const onRed = palette.light.accentOn;

  switch (kind) {
    case "placeholder":
      return {
        background: tokens.surfaceVariant,
        fill: tokens.surfaceVariant,
        outline: "transparent",
        outlineWidth: 0,
        text: tokens.textMuted,
      };
    case "shut":
      return {
        background: closed,
        fill: closed,
        outline: "transparent",
        outlineWidth: 0,
        text: onRed,
      };
    case "full":
      return {
        background: tokens.actionYellow,
        fill: tokens.actionYellow,
        outline: "transparent",
        outlineWidth: 0,
        text: tokens.actionYellowOn,
      };
    case "open":
      return {
        background: white,
        fill: white,
        outline: theme === "light" ? tokens.outline : "transparent",
        outlineWidth: theme === "light" ? 1 : 0,
        text: onWhite,
      };
    case "progress": {
      const onYellow = (liquid ?? 0) >= 0.5;
      return {
        background: tokens.canvas,
        fill: tokens.actionYellow,
        outline: theme === "dark" ? tokens.textPrimary : tokens.outline,
        outlineWidth: 1.5,
        text: onYellow ? tokens.actionYellowOn : tokens.textPrimary,
      };
    }
  }
}

function useTickingClock(): Date {
  const reduceMotion = useReducedMotion();
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const interval = reduceMotion ? 60_000 : 1_000;
    const id = setInterval(() => setClock(new Date()), interval);
    return () => clearInterval(id);
  }, [reduceMotion]);

  return clock;
}
