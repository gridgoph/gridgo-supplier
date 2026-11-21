import { router } from "expo-router";
import { QrCode, Send, UserRound, type LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";

import { OnboardingStep } from "@/components/OnboardingStep";
import { PrimaryButton } from "@/components/PrimaryButton";
import { OptionList } from "@/components/controls/OptionList";
import { useThemeColors } from "@/hooks/useTheme";
import { stepAt } from "@/lib/onboardingSteps";
import { useSignupDraft } from "@/store/signupDraft";

const CHOICES = [
  { value: "just_me", label: "Just me", detail: "You accept and print every job yourself." },
  {
    value: "me_and_staff",
    label: "Me and staff",
    detail: "Staff accept and print jobs. No money, no settings.",
  },
] as const;

const WAYS: { icon: LucideIcon; title: string; detail: string }[] = [
  { icon: Send, title: "Send link", detail: "Messenger, Viber or text" },
  { icon: QrCode, title: "Show QR", detail: "They scan it with their phone camera" },
  { icon: UserRound, title: "Staff without a phone", detail: "A name and a 4-digit PIN for the shop phone" },
];

/**
 * Step four: who handles the jobs (report F315793B).
 *
 * Nobody can be invited before the account exists, so this step only asks.
 * "Me and staff" opens the Team screen the moment the account opens, where
 * the three ways shown here are one tap each — and the shop carries on with
 * setup while links wait for people to join.
 */
export default function TeamStep() {
  const colors = useThemeColors();
  const draft = useSignupDraft((s) => s.draft);
  const patch = useSignupDraft((s) => s.patch);
  const step = stepAt("team");
  const withStaff = draft.jobsHandledBy === "me_and_staff";

  return (
    <OnboardingStep
      id="team"
      title={step.title}
      lede={step.lede}
      contentClassName="pb-4 pt-4"
      footer={<PrimaryButton label="Continue" onPress={() => router.push("/(auth)/signup/review")} />}
    >
      <View className="gap-6">
        <OptionList
          options={CHOICES}
          value={draft.jobsHandledBy ?? "just_me"}
          onChange={(value) => patch({ jobsHandledBy: value })}
          accessibilityLabel="Who handles the jobs"
        />
        {withStaff ? (
          <View className="gap-3">
            <Text className="text-overline text-text-muted">ADD THEM RIGHT AFTER YOU SEND</Text>
            <View className="gg-card-flush">
              {WAYS.map((way, index) => (
                <View
                  key={way.title}
                  className={
                    index === 0
                      ? "min-h-16 flex-row items-center gap-3 px-4 py-3"
                      : "min-h-16 flex-row items-center gap-3 border-t border-outline-subtle px-4 py-3"
                  }
                >
                  <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
                    <way.icon size={20} color={colors.textPrimary} aria-hidden />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-body font-bold text-text-primary">{way.title}</Text>
                    <Text className="text-caption text-text-muted">{way.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Text className="text-caption text-text-muted">
              Links last 24 hours. You can keep going with setup while they join.
            </Text>
          </View>
        ) : (
          <Text className="text-body text-text-secondary">You can add staff later from My shop, any time.</Text>
        )}
      </View>
    </OnboardingStep>
  );
}
