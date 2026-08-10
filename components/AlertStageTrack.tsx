import { MapPin, Package, Printer, ClipboardCheck, type LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";

import { ALERT_STAGES, type AlertStageId } from "@/lib/alertStages";
import { useThemeColors } from "@/hooks/useTheme";

const ICONS: Record<AlertStageId, LucideIcon> = {
  accepted: ClipboardCheck,
  printing: Printer,
  pickup: Package,
  delivered: MapPin,
};

type Props = {
  /** Index into `ALERT_STAGES`. Negative draws nothing. */
  index: number;
};

/**
 * Where the job behind an alert stands, drawn inline.
 *
 * A job really does move through these four in order, so the track is
 * information rather than ornament — it is the one structural device on this
 * card that earns its place.
 *
 * It stays monochrome. The legacy card ran the whole rail in brand yellow,
 * which works on one card and not on a screen holding six: the yellow budget
 * is a screen's, not a card's. Reached stages take the accent, the stage the
 * job is on takes a ring as well, and the rest sit on the outline — so the
 * track reads in grayscale and to a screen reader, which is the requirement
 * colour was never allowed to carry on its own.
 */
export function AlertStageTrack({ index }: Props) {
  const colors = useThemeColors();
  if (index < 0) return null;

  const stage = ALERT_STAGES[index];

  return (
    <View
      className="gap-2"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: ALERT_STAGES.length, now: index + 1 }}
      accessibilityLabel={`Job stage ${index + 1} of ${ALERT_STAGES.length}, ${stage.label}`}
    >
      <View
        className="flex-row"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {ALERT_STAGES.map((entry, position) => {
          const reached = position <= index;
          const current = position === index;
          const Icon = ICONS[entry.id];

          return (
            <View key={entry.id} className="flex-1 items-center gap-1.5">
              <View className="w-full flex-row items-center">
                {/* Rail to the left of this stop, drawn only between stops. */}
                <View
                  className={
                    position === 0
                      ? "h-0.5 flex-1 bg-transparent"
                      : reached
                        ? "h-0.5 flex-1 bg-accent"
                        : "h-0.5 flex-1 bg-outline"
                  }
                />
                <View
                  className={
                    current
                      ? "h-7 w-7 items-center justify-center rounded-pill border-2 border-accent bg-accent"
                      : reached
                        ? "h-7 w-7 items-center justify-center rounded-pill bg-accent"
                        : "h-7 w-7 items-center justify-center rounded-pill border border-outline bg-surface"
                  }
                >
                  <Icon
                    size={14}
                    strokeWidth={2}
                    color={reached ? colors.accentOn : colors.textMuted}
                  />
                </View>
                <View
                  className={
                    position === ALERT_STAGES.length - 1
                      ? "h-0.5 flex-1 bg-transparent"
                      : position < index
                        ? "h-0.5 flex-1 bg-accent"
                        : "h-0.5 flex-1 bg-outline"
                  }
                />
              </View>
              <Text
                numberOfLines={1}
                className={
                  reached
                    ? "text-caption font-medium text-text-primary"
                    : "text-caption text-text-muted"
                }
              >
                {entry.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
