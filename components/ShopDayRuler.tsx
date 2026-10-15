import { Text, View } from "react-native";

import { timeLabel } from "@/lib/shopHours";

type Props = {
  /** Today's usual hours, or null on a closed day. */
  opensMinute: number | null;
  closesMinute: number | null;
  /** Today's extension close, drawn after the usual close. */
  extensionUntil: number | null;
  /** Minutes since Manila midnight. */
  nowMinute: number;
};

const DAY = 1440;
const TICKS = [0, 360, 720, 1080, 1440];
const TICK_LABEL: Record<number, string> = { 0: "12 AM", 360: "6 AM", 720: "12 PM", 1080: "6 PM", 1440: "12 AM" };

const percent = (minute: number) => `${(Math.min(Math.max(minute, 0), DAY) / DAY) * 100}%` as const;

/**
 * Today as one bar, midnight to midnight: the usual hours in ink, an extension
 * as an outlined run after them, and a needle where Manila's clock stands.
 *
 * A shop reads "Open until 8:00 PM" faster as a shape than as a sentence, and
 * the same bar shows why an extension is short when it starts after closing.
 * The sentence is still said beside it and to a screen reader, so nothing
 * depends on the drawing.
 */
export function ShopDayRuler({ opensMinute, closesMinute, extensionUntil, nowMinute }: Props) {
  const open = opensMinute != null && closesMinute != null;
  const extensionFrom = open && extensionUntil != null ? Math.max(closesMinute, Math.min(nowMinute, extensionUntil)) : null;
  const summary = open
    ? `Today: open ${timeLabel(opensMinute)} to ${timeLabel(closesMinute)}${
        extensionUntil != null ? `, extended to ${timeLabel(extensionUntil)}` : ""
      }. It is ${timeLabel(Math.floor(nowMinute))} now.`
    : `Today: closed. It is ${timeLabel(Math.floor(nowMinute))} now.`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} className="gap-1.5">
      <View className="h-7 justify-center">
        <View className="h-3 w-full overflow-hidden rounded-pill border border-outline bg-surface-variant">
          {open ? (
            <View
              className="absolute bottom-0 top-0 bg-accent"
              style={{ left: percent(opensMinute), width: percent(closesMinute - opensMinute) }}
            />
          ) : null}
          {extensionFrom != null && extensionUntil != null && extensionUntil > extensionFrom ? (
            <View
              className="absolute bottom-0 top-0 border-2 border-accent bg-surface"
              style={{ left: percent(extensionFrom), width: percent(extensionUntil - extensionFrom) }}
            />
          ) : null}
        </View>
        <View
          className="absolute bottom-0 top-0 w-0.5 rounded-pill bg-text-primary"
          style={{ left: percent(nowMinute), marginLeft: -1 }}
        />
      </View>
      <View className="flex-row justify-between">
        {TICKS.map((tick) => (
          <Text key={tick} className="text-caption text-text-muted">
            {TICK_LABEL[tick]}
          </Text>
        ))}
      </View>
    </View>
  );
}
