import { CircleCheck } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { meterCells, streakLabel, TESTER_RUN_DAYS, type TesterCardView } from "@/lib/testerProgram";

/**
 * Home's tester check-in: one short card, only for an enrolled tester.
 *
 * The fourteen squares are the run — the GRIDGO grid, filled in ink as days
 * are kept, today's square open until it is. Opening the app already checks
 * in, so this card mostly reads "Done for today"; the button is the way back
 * when that call could not land. No yellow: Home's one yellow is the "+".
 */
export function TesterCheckInCard({
  view,
  busy,
  failed,
  onCheckIn,
}: {
  view: TesterCardView;
  busy: boolean;
  failed: boolean;
  onCheckIn: () => void;
}) {
  const colors = useThemeColors();
  const complete = view.kind === "complete";
  const day = complete ? TESTER_RUN_DAYS : view.day;
  const streak = complete ? TESTER_RUN_DAYS : view.streak;
  const checkedIn = complete || view.checkedIn;
  const title = complete ? `All ${TESTER_RUN_DAYS} days` : `Day ${day} of ${TESTER_RUN_DAYS}`;
  const subtitle = complete ? "Thank you for testing" : streakLabel(streak);
  const cells = meterCells(streak, checkedIn);

  return (
    <View className="gg-card-flush flex-row items-center gap-3 py-3 pl-4 pr-3">
      <View
        className="min-w-0 flex-1 gap-2"
        accessible
        accessibilityLabel={`Tester check-in. ${title}. ${subtitle}.${checkedIn ? " Done for today." : ""}`}
      >
        <View className="flex-row items-baseline gap-2">
          <Text className="text-body font-bold text-text-primary">{title}</Text>
          <Text className="text-caption text-text-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View className="flex-row" style={{ gap: 3 }}>
          {cells.map((cell, index) => (
            <View
              key={index}
              testID={`tester-cell-${cell}`}
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: cell === "done" ? colors.textPrimary : cell === "ahead" ? colors.outline : "transparent",
                borderWidth: cell === "today" ? 1.5 : 0,
                borderColor: colors.textPrimary,
              }}
            />
          ))}
        </View>
      </View>

      {checkedIn ? (
        // As tall as the button, so the card keeps its height when today lands.
        <View className="h-11 flex-row items-center gap-1.5 pr-1">
          <CircleCheck size={18} color={colors.success} strokeWidth={2} />
          <Text className="text-caption font-medium text-text-secondary">
            {complete ? "Done" : "Done for today"}
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={onCheckIn}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          className="gg-btn-secondary"
          style={({ pressed }) => ({ opacity: pressed || busy ? 0.6 : 1 })}
        >
          <Text className="text-button text-text-primary">
            {busy ? "Checking in…" : failed ? "Try again" : "Check in"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
