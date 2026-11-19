import { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import { ArrowRightLeft } from "lucide-react-native";

import { StatusChip } from "@/components/StatusChip";
import { useNow } from "@/hooks/useNow";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { acceptWindow, acceptWindowTickMs, formatCountdown } from "@/lib/acceptWindow";

type Props = {
  order: Pick<Order, "state" | "shopAcceptance" | "shopRecovery">;
  /** Called once when the five minutes run out on this screen. */
  onExpire?: () => void;
};

/**
 * Express's five minutes, as one big clock.
 *
 * The time left is the largest type on the screen and the bar drains with it.
 * Charcoal until the last minute, then the error colour — with the words
 * "Last minute" too, so the state never rides on colour alone. At zero the
 * order goes to the next shop; nothing goes on this shop's record.
 */
export function ExpressCountdown({ order, onExpire }: Props) {
  const colors = useThemeColors();
  const now = useNow(acceptWindowTickMs(acceptWindow(order)));
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
      <View className="gg-card gap-2" testID="express-countdown">
        <View className="flex-row">
          <StatusChip tone="neutral" label="Time's up" icon="circle-x" />
        </View>
        <Text className="text-body-lg font-medium text-text-primary">Sent to the next shop</Text>
      </View>
    );
  }

  // A window that pauses over closed hours is not Express's; say the time plainly.
  const remainingMs = window.kind === "running" ? window.remainingMs : window.deadlineAt.getTime() - now.getTime();
  const left = window.kind === "running" ? 1 - window.elapsed : 1;
  const closing = window.kind === "running" && window.closing;

  return (
    <View
      className={closing ? "gg-card gap-3 border-error" : "gg-card gap-3"}
      testID="express-countdown"
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`${formatCountdown(remainingMs)} left to accept. At zero it goes to the next shop.`}
    >
      <View className="flex-row items-end justify-between gap-3">
        <Text
          className={closing ? "text-display text-error" : "text-display text-text-primary"}
          style={{ fontVariant: ["tabular-nums"] }}
          testID="express-countdown-time"
        >
          {formatCountdown(remainingMs)}
        </Text>
        <View className="flex-row items-center gap-1.5 pb-1">
          <ArrowRightLeft size={14} color={colors.textMuted} strokeWidth={2} />
          <Text className="text-caption text-text-muted">
            {closing ? "Last minute" : "Next shop at 0:00"}
          </Text>
        </View>
      </View>
      <View className="h-2 w-full overflow-hidden rounded-pill bg-outline" aria-hidden>
        <View
          className={closing ? "h-full rounded-pill bg-error" : "h-full rounded-pill bg-accent"}
          style={{ width: `${Math.round(left * 100)}%` }}
        />
      </View>
    </View>
  );
}
