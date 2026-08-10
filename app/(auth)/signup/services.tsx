import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { router } from "expo-router";

import { CategoryRankList } from "@/components/CategoryRankList";
import { OnboardingStep } from "@/components/OnboardingStep";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PUBLISHED_CATALOG } from "@/data/serviceCatalog";
import { hasProblems, servicesStepProblems, stepAt } from "@/lib/onboardingSteps";
import { promoteCategory, toggleCategory } from "@/lib/signup";
import { useSignupDraft } from "@/store/signupDraft";

/**
 * Step three: what the shop prints, best first.
 *
 * The order is the data — GRIDGO offers work in the order declared here — so
 * the list is the same reorderable one the app has always used rather than a
 * second way of expressing the same thing.
 *
 * The categories come from this app's copy of GRIDGO's published chart, because
 * the live vocabulary is behind sign-in and nobody has signed in yet. The
 * platform re-checks every code and is the authority.
 */
export default function ServicesStep() {
  const draft = useSignupDraft((s) => s.draft);
  const patch = useSignupDraft((s) => s.patch);
  const [showProblem, setShowProblem] = useState(false);

  const step = stepAt("services");
  const problems = servicesStepProblems(draft);

  function next() {
    if (hasProblems(problems)) {
      setShowProblem(true);
      return;
    }
    router.push("/(auth)/signup/documents");
  }

  return (
    <OnboardingStep
      id="services"
      title={step.title}
      lede={step.lede}
      onBack={() => router.back()}
      backLabel="Back to your pin"
      footer={
        <>
          {showProblem && problems.categoryCodes ? (
            <Text className="text-caption text-error">{problems.categoryCodes}</Text>
          ) : null}
          <PrimaryButton label="Continue" onPress={next} />
        </>
      }
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-4 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <CategoryRankList
          categories={PUBLISHED_CATALOG.map((category) => ({
            code: category.code,
            name: category.name,
            bestFor: category.audience,
          }))}
          value={draft.categoryCodes}
          onToggle={(code) => patch({ categoryCodes: toggleCategory(draft.categoryCodes, code) })}
          onPromote={(code) => patch({ categoryCodes: promoteCategory(draft.categoryCodes, code) })}
        />
      </ScrollView>
    </OnboardingStep>
  );
}
