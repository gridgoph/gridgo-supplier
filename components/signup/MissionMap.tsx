import { Check, Clock } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import {
  doneCount,
  minutesLabel,
  minutesLeft,
  missionStates,
  isHomeSignup,
  missionsFor,
  requiredMissionsFor,
  type GuidedSignup,
  type Mission,
  type MissionId,
  type MissionState,
} from "@/lib/guidedSignup";

type Props = {
  signup: GuidedSignup | null;
  /** Opens a mission's screen. A mission still "later" cannot be opened yet. */
  onOpen: (id: MissionId) => void;
  /** Whether the optional verification is already done. */
  verified?: boolean;
  /** False before the shop exists: verification needs a shop to verify. */
  verifyOpen?: boolean;
};

/**
 * "Set up your shop in 5 minutes" — the whole sign-up as one map.
 *
 * A route rather than a checklist: each mission is a stop on one line, so a
 * shop owner sees at a glance where they are, what is behind them and how
 * little is left. The stop to do now is the only yellow thing on the line;
 * done stops are filled and say so in words too (never colour alone).
 * Every stop carries its time, because "about a minute" is what gets a busy
 * owner to start one more.
 */
export function MissionMap({ signup, onOpen, verified = false, verifyOpen = true }: Props) {
  const states = missionStates(signup);
  const done = doneCount(signup);
  const required = requiredMissionsFor(signup);
  const total = required.length;
  const left = minutesLeft(signup);
  const verify = missionsFor(signup).find((mission) => mission.id === "verify");
  // A home printer's last stop is Starter: needed before the first job, not optional.
  const home = isHomeSignup(signup);

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text className="text-body font-medium text-text-primary" testID="mission-count">
          {done === total ? `All ${total} done` : `${done} of ${total} done · about ${left} min left`}
        </Text>
        <View
          className="h-2 flex-row overflow-hidden rounded-pill bg-outline"
          accessibilityRole="progressbar"
          accessibilityLabel={`${done} of ${total} steps done`}
          accessibilityValue={{ min: 0, max: total, now: done }}
        >
          <View className="h-2 rounded-pill bg-accent" style={{ width: `${(done / total) * 100}%` }} />
        </View>
      </View>

      <View>
        {required.map((mission, index) => (
          <Stop
            key={mission.id}
            mission={mission}
            number={index + 1}
            state={states[mission.id as keyof typeof states]}
            last={index === total - 1}
            onOpen={() => onOpen(mission.id)}
          />
        ))}
      </View>

      {verify ? (
        <View className="gap-2">
          <Text className="text-body font-medium text-text-primary">
            {home ? "Before your first job" : "Optional"}
          </Text>
          <Stop
            mission={verify}
            number={null}
            state={verified ? "done" : "later"}
            openable={verifyOpen && !verified}
            last
            onOpen={() => onOpen("verify")}
          />
          <Text className="text-caption text-text-muted">
            {home
              ? verifyOpen
                ? "Your ID, a selfie and a test print. GRIDGO checks them, then you can go online."
                : "Opens once your account is open."
              : verifyOpen
                ? "Send your papers any time. Verified shops show a badge to clients."
                : "Opens once your shop is set up."}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Stop({
  mission,
  number,
  state,
  last,
  openable,
  onOpen,
}: {
  mission: Mission;
  number: number | null;
  state: MissionState;
  last: boolean;
  openable?: boolean;
  onOpen: () => void;
}) {
  const colors = useThemeColors();
  const canOpen = openable ?? (state === "done" || state === "current" || state === "waiting");
  const status =
    state === "done" ? "Done" : state === "waiting" ? "Waiting for owner" : minutesLabel(mission.minutes);

  return (
    <Pressable
      onPress={canOpen ? onOpen : undefined}
      disabled={!canOpen}
      accessibilityRole="button"
      accessibilityState={{ disabled: !canOpen }}
      accessibilityLabel={`${mission.title}, ${status}`}
      testID={`mission-${mission.id}`}
      className="flex-row gap-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {/* The line and its stop. */}
      <View className="w-8 items-center">
        <View
          className={
            state === "done"
              ? "h-8 w-8 items-center justify-center rounded-pill bg-accent"
              : state === "current"
                ? "h-8 w-8 items-center justify-center rounded-pill bg-action-yellow"
                : "h-8 w-8 items-center justify-center rounded-pill border border-outline bg-surface"
          }
        >
          {state === "done" ? (
            <Check size={16} color={colors.accentOn} strokeWidth={3} aria-hidden />
          ) : state === "waiting" ? (
            <Clock size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
          ) : (
            <Text
              className={
                state === "current"
                  ? "text-caption font-bold text-action-yellow-on"
                  : "text-caption font-bold text-text-muted"
              }
            >
              {number ?? "+"}
            </Text>
          )}
        </View>
        {last ? null : (
          <View className={state === "done" ? "w-0.5 flex-1 bg-accent" : "w-0.5 flex-1 bg-outline"} />
        )}
      </View>

      <View className={last ? "min-w-0 flex-1 flex-row items-start gap-3" : "min-w-0 flex-1 flex-row items-start gap-3 pb-5"}>
        <View className="min-w-0 flex-1">
          <Text
            className={
              state === "later"
                ? "text-body-lg font-medium text-text-muted"
                : "text-body-lg font-medium text-text-primary"
            }
          >
            {mission.title}
          </Text>
          <Text className="text-caption text-text-muted">{mission.local}</Text>
        </View>
        <Text
          className={
            state === "done"
              ? "pt-0.5 text-caption font-medium text-success"
              : state === "current"
                ? "pt-0.5 text-caption font-bold text-text-primary"
                : "pt-0.5 text-caption text-text-muted"
          }
        >
          {status}
        </Text>
      </View>
    </Pressable>
  );
}
