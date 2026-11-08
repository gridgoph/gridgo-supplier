import { Pressable, Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { SelectField } from "@/components/controls/SelectField";
import { rangeLabel, timeLabel, type DayHours } from "@/lib/shopHours";

type Props = {
  /** "Saturday". */
  long: string;
  /** "Sat". */
  short: string;
  isToday: boolean;
  /** The hours this day keeps: its own when `different`, otherwise the usual ones. */
  hours: DayHours;
  different: boolean;
  onToggle: (different: boolean) => void;
  onPickTime: (which: "opensMinute" | "closesMinute") => void;
  /** Why this day's hours cannot be saved, said under its fields. */
  error: string | null;
  disabled: boolean;
};

/**
 * One open day of the week: its hours at a glance and a switch for "Different
 * hours". The usual hours read muted, a day with its own reads in ink, so a
 * short Saturday stands out in the list without a word of explanation. Turning
 * the switch on opens the day's own opening and closing fields.
 */
export function DayHoursRow({ long, short, isToday, hours, different, onToggle, onPickTime, error, disabled }: Props) {
  return (
    <View className="gap-3 border-t border-outline-subtle pt-3">
      <Pressable
        onPress={() => onToggle(!different)}
        disabled={disabled}
        accessibilityRole="switch"
        accessibilityState={{ checked: different, disabled }}
        accessibilityLabel={`${long}, different hours`}
        accessibilityHint={different ? `${rangeLabel(hours)}. Tap to use your usual hours.` : `Usual hours, ${rangeLabel(hours)}.`}
        className={disabled ? "gg-touch gg-disabled flex-row items-center gap-3" : "gg-touch flex-row items-center gap-3"}
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <Text className="w-12 text-body font-bold text-text-primary">
          {short}
          {isToday ? <Text className="text-caption font-medium text-text-muted">{"\n"}Today</Text> : null}
        </Text>
        <Text
          className={different ? "min-w-0 flex-1 text-body font-medium text-text-primary" : "min-w-0 flex-1 text-body text-text-muted"}
          numberOfLines={1}
        >
          {rangeLabel(hours)}
        </Text>
        <View className="items-center gap-1">
          <View
            className={
              different
                ? "h-6 w-10 flex-row items-center justify-end rounded-pill bg-accent px-1"
                : "h-6 w-10 flex-row items-center justify-start rounded-pill border-2 border-text-muted bg-surface px-0.5"
            }
          >
            <View className={different ? "h-4 w-4 rounded-pill bg-accent-on" : "h-4 w-4 rounded-pill bg-text-muted"} />
          </View>
          <Text className="text-caption text-text-muted" aria-hidden>
            {different ? "Own" : "Usual"}
          </Text>
        </View>
      </Pressable>

      {different ? (
        <View className="flex-row flex-wrap gap-3">
          <View className="min-w-36 flex-1">
            <SelectField
              label={`${short} opens`}
              valueLabel={timeLabel(hours.opensMinute)}
              accessibilityLabel={`${long} opening time, ${timeLabel(hours.opensMinute)}`}
              onPress={() => onPickTime("opensMinute")}
            />
          </View>
          <View className="min-w-36 flex-1">
            <SelectField
              label={`${short} closes`}
              valueLabel={timeLabel(hours.closesMinute)}
              accessibilityLabel={`${long} closing time, ${timeLabel(hours.closesMinute)}`}
              onPress={() => onPickTime("closesMinute")}
            />
          </View>
        </View>
      ) : null}
      {error ? <ErrorNotice message={error} /> : null}
    </View>
  );
}
