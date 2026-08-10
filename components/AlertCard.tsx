import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import type { SharedValue } from "react-native-reanimated";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { AlertStageTrack } from "@/components/AlertStageTrack";
import type { Notification } from "@/lib/api";
import { formatNotificationAt } from "@/lib/dates";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  alert: Notification;
  unread: boolean;
  /** Index into `ALERT_STAGES`, or -1 when the alert is not about a job. */
  stageIndex: number;
  onMarkRead: () => void;
  /** Absent when the alert is not about a job the shop can open. */
  onOpen?: () => void;
};

/**
 * One alert, after the legacy GRIDGO card.
 *
 * What that card got right and this keeps: an unread one looks different at a
 * glance, the stamp says the day as well as the time, a swipe clears it, and
 * the job's own stage is drawn inline so a shop can see where the work is
 * without opening anything.
 *
 * What it does not keep: a hard-coded dark card and a yellow rail. Those were a
 * second visual identity living inside a screen, and this app has one.
 *
 * Swiping and tapping both mark it read on this device — see `store/alerts` for
 * why that is the honest limit of what GRIDGO can be told.
 */
export function AlertCard({ alert, unread, stageIndex, onMarkRead, onOpen }: Props) {
  const colors = useThemeColors();

  const card = (
    <Pressable
      onPress={() => {
        onMarkRead();
        onOpen?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? "Unread. " : ""}${alert.title}. ${alert.body}`}
      accessibilityHint={onOpen ? "Opens the job and marks this read" : "Marks this read"}
      className={
        unread
          ? "gg-touch gap-3 rounded-card border border-outline bg-surface-high p-4"
          : "gg-touch gg-card gap-3"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="gap-1">
        <View className="flex-row items-start justify-between gap-3">
          <Text
            className={
              unread
                ? "min-w-0 flex-1 text-body-lg font-medium text-text-primary"
                : "min-w-0 flex-1 text-body font-medium text-text-secondary"
            }
          >
            {alert.title}
          </Text>
          {unread ? (
            <View
              className="mt-1.5 h-2 w-2 rounded-pill bg-brand"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ) : null}
        </View>
        <Text
          className={unread ? "text-body text-text-secondary" : "text-body text-text-muted"}
        >
          {alert.body}
        </Text>
        <Text className="text-caption text-text-muted">
          {formatNotificationAt(alert.at)}
        </Text>
      </View>

      {stageIndex >= 0 ? (
        <>
          <View className="gg-divider" />
          <AlertStageTrack index={stageIndex} />
        </>
      ) : null}
    </Pressable>
  );

  // Nothing left to clear on one that is already read, and a swipe that does
  // nothing is worse than no swipe at all.
  if (!unread) return card;

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={48}
      renderRightActions={(_progress, translation) => (
        <MarkReadAction translation={translation} color={colors.textSecondary} />
      )}
      onSwipeableOpen={(direction) => {
        if (direction === "right") onMarkRead();
      }}
    >
      {card}
    </ReanimatedSwipeable>
  );
}

/**
 * What sits behind the card as it slides. It names the outcome — a tick and
 * "Read" — so the gesture is not a guess the first time someone tries it.
 */
function MarkReadAction({
  translation,
  color,
}: {
  translation: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translation.value + 96 }],
  }));

  return (
    <View className="w-24 items-center justify-center rounded-card bg-surface-variant">
      <Animated.View style={style} className="items-center gap-1">
        <Check size={20} color={color} strokeWidth={2} />
        <Text className="text-caption text-text-secondary">Read</Text>
      </Animated.View>
    </View>
  );
}
