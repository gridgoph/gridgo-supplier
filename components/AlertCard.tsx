import { Image } from "expo-image";
import { Check, Trash2 } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

import { AlertStageTrack } from "@/components/AlertStageTrack";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusChip } from "@/components/StatusChip";
import { notificationImageUrl, type Notification, type Order } from "@/lib/api";
import { formatNotificationAt } from "@/lib/dates";
import { owedProductionMove } from "@/lib/productionNudge";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  alert: Notification;
  unread: boolean;
  /** Index into `ALERT_STAGES`, or -1 when the alert is not about a job. */
  stageIndex: number;
  onMarkRead: () => void;
  /** Asks first — deleting an alert loses something a shop may still need. */
  onDelete: () => void;
  /** Absent when the alert is not about a job the shop can open. */
  onOpen?: () => void;
  /** The live job, when the inbox has it. The owed-move line reads this, not the snapshot. */
  job?: Pick<Order, "state" | "title" | "payoutMilestones" | "payoutHold"> | null;
};

/**
 * One alert, after the legacy GRIDGO card.
 *
 * What that card got right and this keeps: an unread one looks different at a
 * glance, the stamp says the day as well as the time, and the job's own stage
 * is drawn inline so a shop can see where the work is without opening
 * anything.
 *
 * ## Every action has two ways in
 *
 * The swipe **reveals** buttons rather than firing on release. A gesture that
 * commits on release has to guess how far is far enough, and getting it wrong
 * deletes something; revealing is also what lets the same two buttons carry
 * their own labels. Neither action is swipe-only: reading is what a tap on the
 * card already does, deleting has its own control in the card, and both are
 * published as accessibility actions so a screen reader reaches them from the
 * rotor without a gesture at all.
 *
 * ## The hang this must not reintroduce
 *
 * The swipeable stays mounted whether or not the alert is still unread.
 * Wrapping only the unread ones tore the gesture handler out of the tree from
 * inside its own open callback — marking read re-rendered this card into the
 * plain branch mid-animation — and the app hung on the swipe. Everything that
 * changes state here closes the row first and defers off the gesture's frame.
 */
export function AlertCard({
  alert,
  unread,
  stageIndex,
  onMarkRead,
  onDelete,
  onOpen,
  job,
}: Props) {
  const colors = useThemeColors();
  const row = useRef<SwipeableMethods>(null);
  const picture = notificationImageUrl(alert.imageUrl);
  const inactive = alert.type === "shop_production_inactive";
  const jobTitle = job?.title || alert.orderTitle;
  const owed = inactive ? owedProductionMove(job, alert.orderState) : null;
  const openJob = () => {
    onMarkRead();
    onOpen?.();
  };

  /** Close the revealed panel, then act — never inside the gesture's frame. */
  const runFromRow = (action: () => void) => {
    row.current?.close();
    setTimeout(action, 0);
  };

  const card = (
    <View
      className={
        unread
          ? "rounded-card border border-outline bg-surface-high p-4"
          : "rounded-card border border-outline bg-surface p-4"
      }
    >
    <View className="flex-row items-start gap-2">
      <Pressable
        onPress={openJob}
        accessibilityRole="button"
        accessibilityLabel={`${unread ? "Unread. " : ""}${alert.title}. ${alert.body}`}
        accessibilityHint={onOpen ? "Opens the job and marks this read" : "Marks this read"}
        // Published so a screen reader reaches both without the swipe.
        accessibilityActions={[
          ...(unread ? [{ name: "markRead", label: "Mark read" }] : []),
          { name: "delete", label: "Delete this alert" },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "markRead") onMarkRead();
          if (event.nativeEvent.actionName === "delete") onDelete();
        }}
        className="gg-touch min-w-0 flex-1 gap-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View className="gap-1">
          {inactive ? <StatusChip tone="warning" icon="triangle-alert" label="Needs an update" /> : null}
          {jobTitle && inactive ? (
            <Text className="text-body font-medium text-text-primary">{jobTitle}</Text>
          ) : null}
          <Text
            className={
              unread
                ? "text-body-lg font-medium text-text-primary"
                : "text-body font-medium text-text-secondary"
            }
          >
            {alert.title}
          </Text>
          <Text
            className={unread ? "text-body text-text-secondary" : "text-body text-text-muted"}
          >
            {alert.body}
          </Text>
          <Text className="text-caption text-text-muted">{formatNotificationAt(alert.at)}</Text>
          {owed ? <Text className="text-body font-medium text-text-primary">{owed}</Text> : null}
        </View>
        {picture ? (
          <Image
            testID="alert-picture"
            source={{ uri: picture }}
            style={{ width: "100%", height: 144, borderRadius: 12 }}
            contentFit="cover"
          />
        ) : null}

        {stageIndex >= 0 ? (
          <>
            <View className="gg-divider" />
            <AlertStageTrack index={stageIndex} />
          </>
        ) : null}
      </Pressable>

      <View className="items-center gap-2">
        {unread ? (
          <View
            className="mt-1.5 h-2 w-2 rounded-pill bg-brand"
            aria-hidden
          />
        ) : null}
        {/*
          The non-swipe route to deleting. Quiet, but always there — a swipe is
          a shortcut for people who know it exists, never the only door.
        */}
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete the alert: ${alert.title}`}
          className="gg-touch items-center justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Trash2 size={18} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
      {inactive && onOpen ? (
        <View className="mt-3">
          <PrimaryButton label="Open job" onPress={openJob} />
        </View>
      ) : null}
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={row}
      friction={2}
      rightThreshold={40}
      // Never fires an action on release; the revealed buttons do that.
      renderRightActions={() => (
        /*
          Hidden from assistive technology on purpose. These buttons are a
          shortcut for a thumb that already knows the gesture; a screen reader
          reaches the same two actions on the card itself, and publishing them
          twice would read every alert out with duplicate controls.
        */
        <View
          className="ml-2 flex-row items-stretch gap-2"
          aria-hidden
        >
          {unread ? (
            <SwipeAction
              label="Read"
              onPress={() => runFromRow(onMarkRead)}
              accessibilityLabel={`Mark read: ${alert.title}`}
            >
              <Check size={20} color={colors.textSecondary} strokeWidth={2} />
            </SwipeAction>
          ) : null}
          <SwipeAction
            label="Delete"
            tone="error"
            onPress={() => runFromRow(onDelete)}
            accessibilityLabel={`Delete the alert: ${alert.title}`}
          >
            <Trash2 size={20} color={colors.error} strokeWidth={2} />
          </SwipeAction>
        </View>
      )}
    >
      {card}
    </ReanimatedSwipeable>
  );
}

/** One revealed button. Icon plus label, so it reads in greyscale. */
function SwipeAction({
  label,
  onPress,
  accessibilityLabel,
  tone = "default",
  children,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: "default" | "error";
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={
        tone === "error"
          ? "gg-touch w-20 items-center justify-center gap-1 rounded-card border border-error bg-surface"
          : "gg-touch w-20 items-center justify-center gap-1 rounded-card bg-surface-variant"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {children}
      <Text className={tone === "error" ? "text-caption text-error" : "text-caption text-text-secondary"}>
        {label}
      </Text>
    </Pressable>
  );
}
