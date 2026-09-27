import { CircleCheck, CircleX } from "lucide-react-native";
import { Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { formatTimelineAt } from "@/lib/dates";
import type { CountRow, CounterCheckView } from "@/lib/pickupCheck";

type Props = {
  check: CounterCheckView;
  /** Opens a message to Operations about this job. Drawn only while the check asks something. */
  onMessageOperations?: () => void;
};

/**
 * The rider's check at the counter, read back to the shop.
 *
 * Drawn on the job while a failed check holds the pickup, and while the shop
 * waits for the rider to check again. It answers the three things a shop asks
 * the moment a pickup is stopped — what failed, how many were counted, and
 * what the rider said — and then who fixes it: the shop, with Operations.
 *
 * The count is the loudest thing here on purpose. "12 short" is the fact a
 * shop can act on without reading anything else, so each line puts what was
 * ordered beside what was counted in large figures and says the gap in words.
 *
 * There is no yellow and no payout here: a counter check pays nobody.
 */
export function CounterCheckPanel({ check, onMessageOperations }: Props) {
  const colors = useThemeColors();
  const blocked = check.stage === "blocked";
  const earlier = check.stage === "recheck";

  return (
    <View
      className={blocked ? "gg-card gap-5 border-error" : "gg-card gap-5"}
      testID="counter-check"
    >
      <View className="gap-2">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <StatusChip tone={check.tone} label={check.status} icon={check.icon} />
          {check.checkedAt ? (
            <Text className="text-caption text-text-muted">
              {earlier ? "Last checked" : "Checked"} {formatTimelineAt(check.checkedAt)}
            </Text>
          ) : null}
        </View>
        <Text className="text-h3 text-text-primary" accessibilityRole="header">
          {check.headline}
        </Text>
        <Text className="text-body text-text-secondary">{check.detail}</Text>
      </View>

      {check.operationsNote ? (
        <Note label="What Operations said" text={check.operationsNote} />
      ) : null}

      {check.riderNote ? (
        <Note
          label={earlier ? "What the rider wrote last time" : "What the rider wrote"}
          text={check.riderNote}
        />
      ) : null}

      {check.failed.length ? (
        <View className="gap-2" accessibilityRole="list">
          <Text className="text-caption text-text-muted">
            {earlier ? "Did not pass last time" : "Did not pass"}
          </Text>
          {check.failed.map((label) => (
            <View key={label} className="flex-row items-center gap-2">
              <CircleX size={18} color={colors.error} strokeWidth={2} />
              <Text className="min-w-0 flex-1 text-body-lg font-medium text-text-primary">
                {label}
              </Text>
            </View>
          ))}
          {check.passed.length ? (
            <View className="flex-row items-start gap-2 pt-1">
              <View className="pt-0.5">
                <CircleCheck size={16} color={colors.textMuted} strokeWidth={2} />
              </View>
              <Text className="min-w-0 flex-1 text-body text-text-muted">
                Passed: {check.passed.join(", ")}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <CountLedger counts={check.counts} label={earlier ? "Last count" : "The count"} />

      {onMessageOperations && check.stage !== "passed" ? (
        <SecondaryButton label="Message Operations" onPress={onMessageOperations} />
      ) : null}
    </View>
  );
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <View className="gg-panel gap-1">
      <Text className="text-caption text-text-muted">{label}</Text>
      <Text className="text-body-lg text-text-primary">“{text}”</Text>
    </View>
  );
}

/**
 * Ordered beside counted, one line per item. A check recorded before counts
 * existed says so — an absent count is never drawn as zero.
 */
export function CountLedger({
  counts,
  label,
  compact = false,
}: {
  counts: CountRow[] | null;
  label: string;
  compact?: boolean;
}) {
  if (!counts) {
    return (
      <View className="gap-1">
        <Text className="text-caption text-text-muted">{label}</Text>
        <Text className="text-body text-text-secondary">Count not recorded on this check.</Text>
      </View>
    );
  }

  return (
    <View accessibilityRole="list">
      <Text className="pb-1 text-caption text-text-muted">{label}</Text>
      {counts.map((row) => (
        <View
          key={row.key}
          className="gap-2 border-t border-outline-subtle py-3"
          accessible
          accessibilityLabel={`${row.name}: ordered ${row.expected}, counted ${row.counted}. ${row.difference}.`}
        >
          <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
            {row.name}
          </Text>
          <View className="flex-row items-end gap-6">
            <Figure caption="Ordered" value={row.expected} compact={compact} />
            <Figure caption="Counted" value={row.counted} compact={compact} off={!row.matches} />
            <View className="min-w-0 flex-1 items-end pb-0.5">
              <StatusChip
                tone={row.matches ? "success" : "error"}
                icon={row.matches ? "circle-check" : "triangle-alert"}
                label={row.difference}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function Figure({
  caption,
  value,
  compact,
  off = false,
}: {
  caption: string;
  value: number;
  compact: boolean;
  off?: boolean;
}) {
  const size = compact ? "text-h3" : "text-h2";
  return (
    <View>
      <Text className="text-caption text-text-muted">{caption}</Text>
      <Text className={`${size} ${off ? "text-error" : "text-text-primary"}`}>
        {value.toLocaleString("en-PH")}
      </Text>
    </View>
  );
}
