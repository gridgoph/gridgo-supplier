import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { DocumentSlot } from "@/components/DocumentSlot";
import { OnboardingStep } from "@/components/OnboardingStep";
import { PrimaryButton } from "@/components/PrimaryButton";
import { chooseFile, takePhoto, type PickOutcome } from "@/lib/pickFile";
import { stepAt } from "@/lib/onboardingSteps";
import { VERIFICATION_DOCUMENTS } from "@/lib/verification";
import { useSignupDraft, type DocumentKind } from "@/store/signupDraft";

/**
 * Step four: the papers Operations accredits a shop on.
 *
 * Deliberately not a gate. A permit sits in a drawer at the shop and an ID is
 * in somebody's wallet — blocking account creation on either turns a
 * five-minute sign-up into a two-day one, and the account is not matchable
 * until Operations approves it in any case. So this step says what is expected,
 * takes what the shop has to hand, and moves on.
 *
 * Files are only *chosen* here. Nothing can be uploaded before an account
 * exists, so the URIs wait in the draft and go up on the last step, once
 * GRIDGO has issued the shop a token.
 */
export default function DocumentsStep() {
  const draft = useSignupDraft((s) => s.draft);
  const setDocument = useSignupDraft((s) => s.setDocument);
  const [problems, setProblems] = useState<Partial<Record<DocumentKind, string>>>({});

  const step = stepAt("documents");
  const chosen = VERIFICATION_DOCUMENTS.filter((d) => draft.documents[d.kind]).length;
  const missingExpected = VERIFICATION_DOCUMENTS.filter(
    (d) => d.expected && !draft.documents[d.kind],
  );

  function apply(kind: DocumentKind, outcome: PickOutcome) {
    if (outcome.ok) {
      setDocument(kind, outcome.document);
      setProblems((current) => ({ ...current, [kind]: undefined }));
      return;
    }
    if (outcome.cancelled) return;
    setProblems((current) => ({ ...current, [kind]: outcome.message }));
  }

  return (
    <OnboardingStep
      id="documents"
      title={step.title}
      lede={step.lede}
      onBack={() => router.back()}
      backLabel="Back to what you print"
      footer={
        <PrimaryButton
          label="Continue"
          onPress={() => router.push("/(auth)/signup/review")}
        />
      }
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 pb-4 pt-4"
        showsVerticalScrollIndicator={false}
      >
        {VERIFICATION_DOCUMENTS.map((definition) => (
          <DocumentSlot
            key={definition.kind}
            definition={definition}
            picked={draft.documents[definition.kind]}
            problem={problems[definition.kind]}
            onTakePhoto={() => void takePhoto().then((o) => apply(definition.kind, o))}
            onChooseFile={() => void chooseFile().then((o) => apply(definition.kind, o))}
            onRemove={() => setDocument(definition.kind, null)}
          />
        ))}

        {/* The constraint, explained before it is hit rather than after. */}
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">
            {missingExpected.length === 0
              ? "Operations has what they usually ask for"
              : "You can send these later"}
          </Text>
          <Text className="text-body text-text-secondary">
            {missingExpected.length === 0
              ? `${chosen} ${chosen === 1 ? "file" : "files"} will go to GRIDGO the moment your account opens.`
              : `Your account opens either way, but Operations cannot accredit a shop without ${missingExpected
                  .map((d) => d.title.toLowerCase())
                  .join(" and ")}. You can add them from your account screen while you wait.`}
          </Text>
        </View>
      </ScrollView>
    </OnboardingStep>
  );
}
