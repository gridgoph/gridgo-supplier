import { router } from "expo-router";
import { Bike, Briefcase, Timer, Wallet, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SheetSurface } from "@/components/SheetSurface";
import { useThemeColors } from "@/hooks/useTheme";
import { PUSH_PROMPT_REASONS, pushPromptCopy, type PushPromptReason } from "@/lib/pushPrompt";
import { openNotificationSettings, usePush } from "@/store/push";
import { closePushPrompt } from "@/store/pushPrompt";

const REASON_ICONS: Record<PushPromptReason["key"], LucideIcon> = {
  offers: Briefcase,
  payouts: Wallet,
  pickups: Bike,
  reminders: Timer,
};

/**
 * Before the phone asks, GRIDGO says what the notifications are for.
 *
 * Presented by `hooks/usePushPromptCheck` over Home, as the platform's own
 * sheet. Android 13+ shows its permission dialog once or twice and then never
 * again, so the dialog is spent only on "Turn on notifications", after the shop
 * has read what will arrive. "Not now" and every other way out simply close it;
 * `lib/pushPrompt.ts` waits a week before opening it again, and the card on
 * Home stays in the meantime.
 *
 * A blocked phone sees the same list with an honest button: the dialog cannot
 * come back, so the action is the phone's own notification settings, and
 * returning to GRIDGO re-reads the permission and registers.
 */
export default function PushPromptSheet() {
  const colors = useThemeColors();
  const enable = usePush((s) => s.enable);
  const [asking, setAsking] = useState(false);
  // Fixed at open: the words do not change under the shop's thumb when the
  // dialog it just answered changes the permission.
  const [mode] = useState<"undetermined" | "blocked">(() =>
    usePush.getState().permission === "blocked" ? "blocked" : "undetermined",
  );

  // Gone by a button, a drag, the back gesture or the stack being re-keyed.
  useEffect(() => closePushPrompt, []);

  const copy = pushPromptCopy(mode);

  async function turnOn() {
    if (mode === "blocked") {
      await openNotificationSettings();
      if (router.canGoBack()) router.back();
      return;
    }
    setAsking(true);
    // Channels first, then the OS dialog, then registration — `enable` owns
    // that order. Whatever the answer, the sheet has done its job.
    await enable();
    setAsking(false);
    if (router.canGoBack()) router.back();
  }

  return (
    <SheetSurface
      title={copy.title}
      body={copy.body}
      footer={
        <>
          <PrimaryButton
            label={asking ? "Asking…" : copy.action}
            disabled={asking}
            onPress={() => void turnOn()}
          />
          <SecondaryButton label="Not now" disabled={asking} onPress={() => router.back()} />
        </>
      }
    >
      <View className="gap-4">
        {PUSH_PROMPT_REASONS.map((reason) => {
          const Icon = REASON_ICONS[reason.key];
          return (
            <View key={reason.key} className="flex-row items-start gap-3">
              <View
                className="h-9 w-9 items-center justify-center rounded-md bg-surface-variant"
                aria-hidden
              >
                <Icon size={18} color={colors.textPrimary} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-body font-medium text-text-primary">{reason.title}</Text>
                <Text className="text-body text-text-secondary">{reason.body}</Text>
              </View>
            </View>
          );
        })}
        <Text className="text-caption text-text-muted">
          You can change this any time in your phone&apos;s settings.
        </Text>
      </View>
    </SheetSurface>
  );
}
