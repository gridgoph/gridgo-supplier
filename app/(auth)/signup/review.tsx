import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import { BusyOverlay } from "@/components/BusyOverlay";
import { ErrorNotice } from "@/components/ErrorNotice";
import { OnboardingStep } from "@/components/OnboardingStep";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PUBLISHED_CATALOG } from "@/data/serviceCatalog";
import { firstIncompleteStep, stepAt, type OnboardingStep as Step } from "@/lib/onboardingSteps";
import { toSignupRequest } from "@/lib/signup";
import { coordinateText, isPlaced } from "@/lib/shopLocation";
import { VERIFICATION_DOCUMENTS } from "@/lib/verification";
import { useAccreditationDocs } from "@/store/accreditationDocs";
import { useSession } from "@/store/session";
import { useSignupDraft } from "@/store/signupDraft";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Step five: one read through, then the account.
 *
 * Everything here is a way back to where it was typed — recognition rather than
 * recall, and the only place in the flow where all four steps are visible at
 * once. Nothing on this screen promises work: the last panel says what actually
 * happens, which is that Operations reviews the shop before a job ever arrives.
 *
 * The papers cannot go up until the account exists, so they are queued here and
 * sent by `store/accreditationDocs` — which outlives this screen, because the
 * moment the account opens the app moves the shop to the accreditation screen.
 */
export default function ReviewStep() {
  const draft = useSignupDraft((s) => s.draft);
  const clearDraft = useSignupDraft((s) => s.clear);
  const { signup, loading, error, clearError } = useSession();
  const queueDocuments = useAccreditationDocs((s) => s.queue);
  const sendDocuments = useAccreditationDocs((s) => s.send);
  const step = stepAt("review");
  const incomplete = firstIncompleteStep(draft);
  const chosenDocuments = VERIFICATION_DOCUMENTS.filter((d) => draft.documents[d.kind]);

  async function open() {
    clearError();
    if (incomplete) {
      router.push(incomplete.route);
      return;
    }
    const request = toSignupRequest(draft);
    if (!request) {
      router.push("/(auth)/signup/location");
      return;
    }

    const created = await signup(request);
    if (!created) return;

    // The account exists and carries a bearer, so the papers now have somewhere
    // to go. Queue before sending: the guard swaps this screen out immediately.
    queueDocuments(draft.documents);
    clearDraft();
    void sendDocuments();
  }

  return (
    <OnboardingStep
      id="review"
      title={step.title}
      lede={step.lede}
      onBack={() => router.back()}
      backLabel="Back to your papers"
      contentClassName="gap-3 pb-4 pt-4"
      overlay={
        <BusyOverlay
          visible={loading}
          label="Opening your shop account. Do not close the app."
        />
      }
      footer={
        <>
          {error ? <ErrorNotice message={error} /> : null}
          <PrimaryButton
            label={loading ? "Opening your account…" : "Open my shop account"}
            disabled={loading}
            onPress={() => void open()}
          />
        </>
      }
    >
      <ReviewCard
        step={stepAt("shop")}
        lines={[draft.shopName, draft.contactName, draft.email, draft.phone].filter(Boolean)}
        missing={incomplete?.id === "shop"}
      />

      <ReviewCard
        step={stepAt("location")}
        lines={
          isPlaced(draft.pin)
            ? [draft.pin.label || "No address on the pin yet", coordinateText(draft.pin)]
            : []
        }
        missing={!isPlaced(draft.pin)}
      />

      <ReviewCard
        step={stepAt("services")}
        lines={draft.categoryCodes.map(
          (code, index) => `${index + 1}. ${categoryName(code)}`,
        )}
        missing={draft.categoryCodes.length === 0}
      />

      <ReviewCard
        step={stepAt("documents")}
        lines={chosenDocuments.map(
          (definition) =>
            `${definition.title} — ${draft.documents[definition.kind]?.fileName ?? ""}`,
        )}
        emptyLine="Nothing added. Operations will ask you for these."
      />

      {/* What actually happens next. The last word on this flow. */}
      <View className="gg-panel gap-2">
        <Text className="text-body font-medium text-text-primary">
          What happens after you press this
        </Text>
        <Text className="text-body text-text-secondary">
          GRIDGO opens your account straight away and signs you in. No job is matched to your
          shop until Operations has read all of this and approved it — so your floor stays
          empty until then, and the app will say so rather than looking like a quiet day.
        </Text>
        <Text className="text-body text-text-secondary">
          They usually come back within a working day. You will not need to sign up again.
        </Text>
      </View>
    </OnboardingStep>
  );
}

/** One step, summarised, and a way back to the screen it was typed on. */
function ReviewCard({
  step,
  lines,
  missing,
  emptyLine,
}: {
  step: Step;
  lines: string[];
  missing?: boolean;
  emptyLine?: string;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={() => router.push(step.route)}
      accessibilityRole="button"
      accessibilityLabel={`Change ${step.title.toLowerCase()}`}
      className="gg-card flex-row items-start gap-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
    <View className="min-w-0 flex-1 gap-1">
      <Text className="text-caption text-text-muted">{step.title}</Text>
      {lines.length ? (
        lines.map((line) => (
          <Text key={line} className="text-body text-text-primary">
            {line}
          </Text>
        ))
      ) : (
        <Text className={missing ? "text-body text-error" : "text-body text-text-muted"}>
          {missing ? "Still needed — tap to fill this in" : (emptyLine ?? "Nothing added")}
        </Text>
      )}
    </View>
    <View className="pt-0.5">
      <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
    </View>
  </Pressable>
);
}

function categoryName(code: string): string {
return PUBLISHED_CATALOG.find((category) => category.code === code)?.name ?? code;
}
