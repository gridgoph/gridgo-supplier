import { X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import {
  MAX_CLOSED_DAYS,
  closedDayCount,
  closureLabel,
  closureLengthLabel,
  manilaClock,
  type Closure,
} from "@/lib/shopHours";

type Props = {
  closures: Closure[];
  now: Date;
  saving: boolean;
  onAdd: () => void;
  onEdit: (closure: Closure) => void;
  onRemove: (closure: Closure) => void;
  /** Closures an older version of the app kept on this phone only. */
  phoneOnlyCount: number;
  onImportPhoneOnly: () => void;
  onDiscardPhoneOnly: () => void;
};

/**
 * Dates the shop is shut — holidays, a maintenance day — saved with GRIDGO, so
 * a job is never timed across them. A past closure is kept until removed,
 * because GRIDGO counts it toward the 90-date limit.
 */
export function ClosureDatesCard({
  closures,
  now,
  saving,
  onAdd,
  onEdit,
  onRemove,
  phoneOnlyCount,
  onImportPhoneOnly,
  onDiscardPhoneOnly,
}: Props) {
  const colors = useThemeColors();
  const today = manilaClock(now).dayKey;
  const used = closedDayCount(closures);

  return (
    <View className="gg-card gap-4">
      <View className="gap-1">
        <Text className="text-h3 text-text-primary" accessibilityRole="header">
          Closure dates
        </Text>
        <Text className="text-body text-text-secondary">
          Holidays and other days you are shut. GRIDGO does not count them when it times a job.
        </Text>
      </View>

      {phoneOnlyCount > 0 ? (
        <View className="gg-panel gap-3">
          <Text className="text-body text-text-primary">
            {phoneOnlyCount === 1
              ? "1 closure is saved on this phone only, from an earlier version of the app."
              : `${phoneOnlyCount} closures are saved on this phone only, from an earlier version of the app.`}{" "}
            GRIDGO cannot see {phoneOnlyCount === 1 ? "it" : "them"} until you add {phoneOnlyCount === 1 ? "it" : "them"} here.
          </Text>
          <SecondaryButton label={phoneOnlyCount === 1 ? "Add it to GRIDGO" : "Add them to GRIDGO"} disabled={saving} onPress={onImportPhoneOnly} />
          <SecondaryButton label="Delete from this phone" disabled={saving} onPress={onDiscardPhoneOnly} />
        </View>
      ) : null}

      {closures.length ? (
        <View className="gap-2">
          {closures.map((closure) => {
            const past = closure.endDay < today;
            const label = closureLabel(closure);
            return (
              <View
                key={`${closure.startDay}-${closure.endDay}`}
                className="flex-row items-center rounded-field border border-outline bg-surface"
              >
                <Pressable
                  onPress={() => onEdit(closure)}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={`Change closure ${label}`}
                  className="gg-touch min-w-0 flex-1 justify-center gap-0.5 py-3 pl-3"
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                >
                  <Text className={past ? "text-body text-text-muted" : "text-body font-medium text-text-primary"}>
                    {label}
                  </Text>
                  <Text className="text-caption text-text-muted">
                    {closureLengthLabel(closure)}
                    {past ? " · Past" : closure.startDay <= today ? " · Today" : ""}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onRemove(closure)}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove closure ${label}`}
                  className="gg-touch items-center justify-center px-3"
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                >
                  <X size={20} color={colors.textMuted} aria-hidden />
                </Pressable>
              </View>
            );
          })}
          <Text className="text-caption text-text-muted">
            {used} of {MAX_CLOSED_DAYS} closure dates used.
          </Text>
        </View>
      ) : (
        <Text className="text-caption text-text-muted">
          No closure dates. Add one before a holiday so no job is timed across it.
        </Text>
      )}

      <SecondaryButton label="Add closure dates" disabled={saving} onPress={onAdd} />
    </View>
  );
}
