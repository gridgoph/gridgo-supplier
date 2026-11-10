import { BadgeCheck, Check, Download, Mail, Users, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { OptInStepKey, OptInStepView } from "@/lib/playOptIn";

const STEP: Record<OptInStepKey, { icon: LucideIcon; label: string }> = {
  gmail: { icon: Mail, label: "Confirm your Gmail" },
  group: { icon: Users, label: "Join the tester group" },
  optin: { icon: BadgeCheck, label: "Tap Become a tester" },
  install: { icon: Download, label: "Install GRIDGO from Play" },
};

const DOT = 32;

/**
 * The Play opt-in as a short vertical track: one icon per step, ink once
 * done, yellow for the step the shop is on (the stepper's allowed yellow),
 * outline for what is ahead. Status is icon + label + colour, never colour
 * alone. A done step may carry one detail (the confirmed Gmail) and one quiet
 * way back to it.
 */
export function PlayOptInTrack({
  steps,
  details = {},
  backTo,
}: {
  steps: OptInStepView[];
  details?: Partial<Record<OptInStepKey, string>>;
  backTo?: { key: OptInStepKey; label: string; onPress: () => void };
}) {
  const colors = useThemeColors();
  return (
    <View accessibilityRole="list">
      {steps.map((step, index) => {
        const { icon: Icon, label } = STEP[step.key];
        const done = step.status === "done";
        const current = step.status === "current";
        const last = index === steps.length - 1;
        const detail = done ? details[step.key] : undefined;
        const back = done && backTo?.key === step.key ? backTo : undefined;
        const state = done ? "Done" : current ? "Now" : "Next";
        return (
          <View key={step.key} className="flex-row gap-3" testID={`optin-step-${step.key}-${step.status}`}>
            <View className="items-center">
              <View
                className={
                  done
                    ? "items-center justify-center rounded-pill bg-accent"
                    : current
                      ? "items-center justify-center rounded-pill bg-action-yellow"
                      : "items-center justify-center rounded-pill border border-outline bg-surface"
                }
                style={{ width: DOT, height: DOT }}
              >
                {done ? (
                  <Check size={16} color={colors.accentOn} strokeWidth={2.5} />
                ) : (
                  <Icon size={16} color={current ? colors.actionYellowOn : colors.textMuted} strokeWidth={2} />
                )}
              </View>
              {last ? null : (
                <View
                  className={done ? "bg-accent" : "bg-outline"}
                  style={{ width: 2, flexGrow: 1, minHeight: 12 }}
                />
              )}
            </View>
            <View
              className="min-w-0 flex-1 flex-row items-start justify-between gap-2"
              style={{ minHeight: DOT, paddingBottom: last ? 0 : 16, paddingTop: 6 }}
            >
              <View className="min-w-0 flex-1" accessible accessibilityLabel={`${label}. ${state}.${detail ? ` ${detail}` : ""}`}>
                <Text
                  className={
                    current
                      ? "text-body font-bold text-text-primary"
                      : done
                        ? "text-body text-text-primary"
                        : "text-body text-text-muted"
                  }
                >
                  {label}
                </Text>
                {detail ? (
                  <Text className="text-caption text-text-secondary" numberOfLines={1}>
                    {detail}
                  </Text>
                ) : null}
              </View>
              {back ? (
                <Pressable
                  onPress={back.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={back.label}
                  hitSlop={8}
                  className="gg-touch justify-center"
                  style={({ pressed }) => ({ marginTop: -12, opacity: pressed ? 0.6 : 1 })}
                >
                  <Text className="text-caption font-bold text-text-primary underline">{back.label}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
