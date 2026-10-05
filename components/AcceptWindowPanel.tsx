import { useEffect, useRef } from "react";
import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { useNow } from "@/hooks/useNow";
import type { Order } from "@/lib/api";
import {
  acceptWindow,
  acceptWindowTickMs,
  answerByTime,
  formatCountdown,
} from "@/lib/acceptWindow";

type Props = {
  order: Pick<Order, "state" | "shopAcceptance" | "shopRecovery">;
  /** Called once when the hour runs out on this screen, so the job redraws without its steps. */
  onExpire?: () => void;
};

/**
 * The shop's hour to answer a new job, as a clock.
 *
 * This is the one loud thing on a new job, because it is the one thing that
 * costs the shop if it is missed: no answer counts as a decline and goes on
 * the record. So the time left is the biggest type on the screen, the bar
 * drains with it, and the sentence under it says what happens at zero. The
 * accept button keeps the yellow; the clock stays charcoal until the last ten
 * minutes, when it turns to the error colour — said in words as well.
 *
 * When the hour reaches past closing time it stops while the shop is shut,
 * and a racing wall clock would be a lie. Then the panel says when the hour
 * runs out and that it pauses, rather than counting.
 */
export function AcceptWindowPanel({ order, onExpire }: Props) {
  // The clock's speed depends on the window, and the window on the clock.
  const tick = acceptWindowTickMs(acceptWindow(order));
  const now = useNow(tick);
  const window = acceptWindow(order, now);

  const fired = useRef(false);
  useEffect(() => {
    if (window.kind === "expired" && !fired.current) {
      fired.current = true;
      onExpire?.();
    }
  }, [window.kind, onExpire]);

  if (window.kind === "none") return null;

  if (window.kind === "expired") {
    return (
      <View className="gg-card gap-2 border-error" testID="accept-window">
        <View className="flex-row">
          <StatusChip tone="error" label="Not answered in time" icon="circle-x" />
        </View>
        <Text className="text-body-lg font-medium text-text-primary">The hour to answer has run out</Text>
        <Text className="text-body text-text-secondary">
          GRIDGO is passing this job on to another shop. It goes on your shop&apos;s record as not
          answered in time.
        </Text>
      </View>
    );
  }

  if (window.kind === "spans_closed") {
    return (
      <View className="gg-card gap-3 border-warning" testID="accept-window">
        <View className="flex-row">
          <StatusChip tone="warning" label="Pauses while you are closed" icon="circle-pause" />
        </View>
        <View className="gap-1">
          <Text className="text-caption text-text-muted">Accept or decline by</Text>
          <Text className="text-h2 text-text-primary">{answerByTime(window.deadlineAt, now)}</Text>
        </View>
        <Text className="text-body text-text-secondary">
          You have one hour of your opening time to answer. Your shop closes before the hour is up,
          so it stops while you are closed and carries on when you open. Not answering by then counts as
          a decline and goes on your shop&apos;s record.
        </Text>
      </View>
    );
  }

  const left = 1 - window.elapsed;
  return (
    <View
      className={window.closing ? "gg-card gap-3 border-error" : "gg-card gap-3 border-warning"}
      testID="accept-window"
      accessible
      accessibilityLabel={`${Math.ceil(window.remainingMs / 60_000)} minutes left to accept or decline this job. Not answering counts as a decline.`}
    >
      <Text className="text-caption text-text-muted">Time left to accept or decline</Text>
      <Text
        className={window.closing ? "text-display text-error" : "text-display text-text-primary"}
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {formatCountdown(window.remainingMs)}
      </Text>
      <View className="h-1.5 w-full overflow-hidden rounded-pill bg-outline" aria-hidden>
        <View
          className={window.closing ? "h-full rounded-pill bg-error" : "h-full rounded-pill bg-accent"}
          style={{ width: `${Math.round(left * 100)}%` }}
        />
      </View>
      <Text className="text-body text-text-secondary">
        {window.closing ? "Under ten minutes left. " : ""}
        Not answering by {answerByTime(window.deadlineAt, now)} counts as a decline and goes on your
        shop&apos;s record. The hour only counts while your shop is open.
      </Text>
    </View>
  );
}
