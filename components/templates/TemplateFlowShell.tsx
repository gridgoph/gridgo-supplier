import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BusyOverlay } from "@/components/BusyOverlay";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { spacing } from "@/constants/theme";

export const TEMPLATE_STEPS = ["What you make", "Prices", "Ready time"] as const;

/**
 * The three steps of adding a GRIDGO product (gridgo-supplier#268).
 *
 * One action per screen, and it is the yellow one at the foot with its Bisaya
 * line under it. The stack header owns the way back, so there is no second
 * button competing with it. The progress track is the only other yellow: the
 * current step, as the design rules allow.
 *
 * `clientSees` is pinned above the foot on every step. It is the trust cue —
 * a shop watches its own product take shape as a client will meet it.
 */
export function TemplateFlowShell({
  step,
  title,
  subtitle,
  queueLine,
  children,
  clientSees,
  actionLabel,
  actionHint,
  onAction,
  footNote,
  busy,
  busyLabel,
}: {
  /** 0, 1 or 2. */
  step: number;
  title: string;
  subtitle?: string;
  /** "Product 2 of 3: Flyers", when several were ticked. */
  queueLine?: string | null;
  children: ReactNode;
  clientSees?: ReactNode;
  actionLabel: string;
  actionHint?: string;
  onAction: () => void;
  /** Says what to fix while the action cannot run. Never a bare disabled button. */
  footNote?: string | null;
  busy: boolean;
  busyLabel: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View className="gg-screen">
      <View className="gg-page gap-2 pt-3" accessibilityRole="progressbar" accessibilityLabel={`Step ${step + 1} of 3, ${TEMPLATE_STEPS[step]}`}>
        <View className="flex-row gap-1.5">
          {TEMPLATE_STEPS.map((name, index) => (
            <View
              key={name}
              className={[
                "h-1.5 flex-1 rounded-pill",
                index === step ? "bg-action-yellow" : index < step ? "bg-accent" : "bg-outline",
              ].join(" ")}
            />
          ))}
        </View>
        <Text className="text-caption text-text-muted">
          Step {step + 1} of 3
        </Text>
        {queueLine ? <Text className="text-caption text-text-secondary">{queueLine}</Text> : null}
      </View>

      <FormScrollView contentClassName="gg-page pb-10 pt-3" bottomOffset={spacing.xxl}>
        <Text className="text-h2 text-text-primary">{title}</Text>
        {subtitle ? <Text className="mt-1 text-body text-text-secondary">{subtitle}</Text> : null}
        {children}
      </FormScrollView>

      {clientSees}

      <View className="border-t border-outline bg-surface px-4 pt-3" style={{ paddingBottom: insets.bottom + spacing.md }}>
        {footNote ? (
          <Text className="mb-2 text-caption text-text-secondary" accessibilityLiveRegion="polite" testID="flow-foot-note">
            {footNote}
          </Text>
        ) : null}
        <PrimaryButton label={actionLabel} hint={actionHint} onPress={onAction} />
      </View>

      <BusyOverlay visible={busy} label={busyLabel} />
    </View>
  );
}
