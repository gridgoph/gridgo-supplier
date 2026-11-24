import { router, type Href } from "expo-router";
import { Clock, House } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { requestCurrentLocation } from "@/lib/deviceLocation";
import { homeSwitch, weeklyJobsLine, weeklyJobsShare, type HomePrinterRead } from "@/lib/homePrinter";
import { useHomePrinter } from "@/store/homePrinter";

/**
 * The home printer's switch on To do (gridgo-api#412 §7).
 *
 * The one big thing on the floor when there is no job: a home printer is not
 * a shop with hours, so whether offers can reach them is this switch, said in
 * a sentence beside it. When GRIDGO has paused offers the card says why and,
 * where GRIDGO says, when it ends — never as blame. Turning on sends the
 * phone's current position, which GRIDGO needs; turning off is one tap.
 *
 * Green and charcoal, not yellow: the yellow on To do belongs to Accept.
 */
export function HomeSwitchCard({ home }: { home: HomePrinterRead }) {
  const colors = useThemeColors();
  const update = useHomePrinter((s) => s.update);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const view = homeSwitch(home.status);
  const weekly = weeklyJobsLine(home.status);
  const share = weeklyJobsShare(home.status);
  const on = view.on;

  async function flip() {
    if (busy || !view.canToggle) return;
    setProblem(null);
    setBusy(true);
    try {
      if (on) {
        const result = await update({ online: false }, "switch you offline");
        if (result.status === "failed") setProblem(result.message);
        return;
      }
      const fix = await requestCurrentLocation();
      if (fix.status !== "ok") {
        setProblem(fix.message);
        return;
      }
      const result = await update({ online: true, location: fix.point }, "switch you online");
      if (result.status === "failed") setProblem(result.message);
    } finally {
      setBusy(false);
    }
  }

  const label = busy ? (on ? "Going offline…" : "Going online…") : on ? "Online" : "Offline";

  return (
    <View
      className={
        view.tone === "online"
          ? "gap-4 rounded-card border-2 border-success bg-surface p-4"
          : "gap-4 rounded-card border border-outline bg-surface p-4"
      }
      testID="home-switch-card"
    >
      <Pressable
        onPress={() => void flip()}
        disabled={!view.canToggle || busy}
        accessibilityRole="switch"
        accessibilityState={{ checked: on, disabled: !view.canToggle || busy }}
        accessibilityLabel={`Take jobs from home. ${label}.`}
        accessibilityHint={view.canToggle ? (on ? "Turns offers off" : "Turns offers on") : undefined}
        className="min-h-14 flex-row items-center gap-3"
        style={({ pressed }) => (pressed && view.canToggle ? { opacity: 0.75 } : undefined)}
        testID="home-switch"
      >
        <View
          className={
            view.tone === "online"
              ? "h-12 w-12 items-center justify-center rounded-pill bg-success"
              : "h-12 w-12 items-center justify-center rounded-pill bg-surface-variant"
          }
        >
          <House size={24} color={view.tone === "online" ? colors.surface : colors.textPrimary} strokeWidth={2.25} aria-hidden />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-caption text-text-muted">Taking jobs from home</Text>
          <Text
            className={view.tone === "online" ? "text-h3 text-success" : "text-h3 text-text-primary"}
            testID="home-switch-label"
          >
            {label}
          </Text>
        </View>
        <Knob on={on} enabled={view.canToggle && !busy} />
      </Pressable>

      <View className="gap-1" testID="home-switch-reason">
        <View className="flex-row items-center gap-1.5">
          {view.tone === "paused" ? (
            <Clock size={16} color={colors.warning} strokeWidth={2.25} aria-hidden />
          ) : null}
          <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">{view.title}</Text>
        </View>
        <Text className="text-body text-text-secondary">{view.body}</Text>
      </View>

      {weekly ? (
        <View className="gap-1.5" testID="home-weekly">
          <View className="flex-row items-center justify-between">
            <Text className="text-caption text-text-muted">This week</Text>
            <Text className="text-caption font-medium text-text-primary">{weekly}</Text>
          </View>
          <View
            className="h-1.5 overflow-hidden rounded-pill bg-surface-variant"
            accessibilityRole="progressbar"
            accessibilityLabel={weekly}
            accessibilityValue={{ min: 0, max: home.status.weeklyJobCap ?? 0, now: home.status.weeklyJobs }}
          >
            <View
              className={share >= 1 ? "h-1.5 rounded-pill bg-warning" : "h-1.5 rounded-pill bg-accent"}
              style={{ width: `${Math.max(share * 100, share ? 4 : 0)}%` }}
            />
          </View>
        </View>
      ) : null}

      {problem ? (
        <Text className="text-body text-error" accessibilityRole="alert" testID="home-switch-problem">
          {problem}
        </Text>
      ) : null}

      {view.action ? (
        <SecondaryButton
          label={view.action.label}
          onPress={() => router.push((view.action?.target === "pin" ? "/home-pin" : "/home-printer") as Href)}
        />
      ) : null}
    </View>
  );
}

/** The switch itself: big enough to find without looking, and labelled beside it. */
function Knob({ on, enabled }: { on: boolean; enabled: boolean }) {
  return (
    <View
      className={
        on
          ? "h-9 w-16 justify-center rounded-pill bg-success px-1"
          : "h-9 w-16 justify-center rounded-pill bg-outline px-1"
      }
      style={enabled ? undefined : { opacity: 0.5 }}
      aria-hidden
    >
      <View className={on ? "h-7 w-7 self-end rounded-pill bg-surface" : "h-7 w-7 self-start rounded-pill bg-surface"} />
    </View>
  );
}
