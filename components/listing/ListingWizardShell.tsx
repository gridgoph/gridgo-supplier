import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BusyOverlay } from "@/components/BusyOverlay";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ListingWizardRail } from "@/components/listing/ListingWizardRail";
import { spacing } from "@/constants/theme";
import { WIZARD_TITLES, type WizardStepId } from "@/lib/listingWizard";

/**
 * Shared chrome for adding a listing.
 *
 * A later PrintZone process step may be inserted after interview notes land.
 * Do not stub a fake step for it — the rail stays Pick through Review until then.
 *
 * The stack header owns the way back. The rail, the scroll and the two foot
 * actions are what remain. Typeable fields sit in FormScrollView; the foot
 * stacks the home-indicator inset with design spacing.
 */
export function ListingWizardShell({
  step,
  furthest,
  committed,
  currentCanProceed,
  onSelectStep,
  title = WIZARD_TITLES[step],
  children,
  preview,
  error,
  onRetryError,
  notOpenMessage,
  leftLabel,
  leftDisabled,
  onLeft,
  rightLabel,
  rightDisabled,
  onRight,
  footNote,
  busy,
  busyLabel,
}: {
  step: WizardStepId;
  furthest: WizardStepId;
  committed: boolean;
  currentCanProceed: boolean;
  onSelectStep: (step: WizardStepId) => void;
  title?: string;
  children: ReactNode;
  preview?: ReactNode;
  error?: string | null;
  onRetryError?: () => void;
  notOpenMessage?: string | null;
  leftLabel: string;
  leftDisabled?: boolean;
  onLeft: () => void;
  rightLabel: string;
  rightDisabled?: boolean;
  onRight: () => void;
  footNote?: string | null;
  busy: boolean;
  busyLabel: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View className="gg-screen">
      <ListingWizardRail
        current={step}
        furthest={furthest}
        committed={committed}
        currentCanProceed={currentCanProceed}
        onSelect={onSelectStep}
      />

      <FormScrollView contentClassName="gg-page pb-10 pt-4" bottomOffset={spacing.xxl}>
        <Text className="text-h2 text-text-primary">{title}</Text>
        {children}
        {notOpenMessage ? (
          <View className="gg-panel mt-6">
            <Text className="text-body text-text-secondary">{notOpenMessage}</Text>
          </View>
        ) : null}
        {error ? (
          <View className="mt-6">
            <ErrorNotice message={error} onRetry={onRetryError} />
          </View>
        ) : null}
      </FormScrollView>

      {preview}

      <View
        className="border-t border-outline bg-surface px-4 pt-3"
        style={{ paddingBottom: insets.bottom + spacing.md }}
      >
        <View className="flex-row gap-3">
          <View className="flex-1">
            <SecondaryButton label={leftLabel} disabled={leftDisabled} onPress={onLeft} />
          </View>
          <View className="flex-1">
            <PrimaryButton label={rightLabel} disabled={rightDisabled} onPress={onRight} />
          </View>
        </View>
        {footNote ? (
          <Text className="mt-2 text-caption text-text-muted">{footNote}</Text>
        ) : null}
      </View>

      <BusyOverlay visible={busy} label={busyLabel} />
    </View>
  );
}
