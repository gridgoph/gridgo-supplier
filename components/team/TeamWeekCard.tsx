import { Text, View } from "react-native";
import { Target, Zap } from "lucide-react-native";

import { useThemeColors } from "@/hooks/useTheme";
import {
  acceptSpeedLabel,
  missionProgress,
  missionTitle,
  type TeamStats,
} from "@/lib/teamRoster";

type Props = {
  stats: TeamStats;
};

/**
 * The week, said positively: who accepts fastest, and how far the team is
 * towards its mission. There is no slowest list and never will be.
 *
 * The average beside the fastest name is drawn only when GRIDGO sent the
 * per-person figures, which it does for Owners and Managers alone — Staff see
 * the badge and the mission, and nothing about anyone's speed. When the Owner
 * hides the ranking, GRIDGO sends Staff no fastest name and the card is the
 * mission only.
 */
export function TeamWeekCard({ stats }: Props) {
  const colors = useThemeColors();
  const fastest = stats.fastest;
  const detail = fastest ? stats.members?.find((member) => member.key === fastest.key) : null;
  const speed = acceptSpeedLabel(detail?.averageAcceptSeconds);
  const mission = stats.mission;
  const progress = mission ? missionProgress(mission) : null;
  if (!fastest && !mission) return null;

  return (
    <View className="gg-card gap-4" testID="team-week-card">
      {fastest ? (
        <View className="flex-row items-start gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
            <Zap size={20} color={colors.textPrimary} aria-hidden />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-body-lg font-bold text-text-primary">Fastest this week: {fastest.name}</Text>
            {detail && speed ? (
              <Text className="text-body text-text-secondary">
                Accepts in {speed} on average · {detail.jobsThisWeek} {detail.jobsThisWeek === 1 ? "job" : "jobs"}
              </Text>
            ) : (
              <Text className="text-body text-text-secondary">Quickest to say yes to new jobs.</Text>
            )}
          </View>
        </View>
      ) : null}

      {mission && progress ? (
        <View className="gap-2">
          <View className="flex-row items-start gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
              <Target size={20} color={colors.textPrimary} aria-hidden />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-body font-bold text-text-primary">{missionTitle(mission)}</Text>
              <Text className="text-body text-text-secondary">
                {mission.completed
                  ? "Done. Well played, team."
                  : `${progress.done} of ${progress.target} so far`}
              </Text>
            </View>
          </View>
          <View
            className="h-2 overflow-hidden rounded-pill bg-surface-variant"
            accessibilityRole="progressbar"
            accessibilityLabel="Team mission"
            accessibilityValue={{ min: 0, max: progress.target, now: progress.done }}
          >
            <View
              className={mission.completed ? "h-2 rounded-pill bg-success" : "h-2 rounded-pill bg-accent"}
              style={{ width: `${Math.round(progress.fraction * 100)}%` }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
