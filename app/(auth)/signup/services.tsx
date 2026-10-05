import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { CategoryRankList } from "@/components/CategoryRankList";
import { OnboardingStep } from "@/components/OnboardingStep";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PUBLISHED_CATALOG } from "@/data/serviceCatalog";
import { IN_HOUSE_ONBOARDING } from "@/lib/inHouse";
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
 *
 * Each category names its products so a shop can find where its work sits, and
 * the note above says a category is not a promise to make all of them
 * (gridgo-supplier#99).
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
    router.push("/(auth)/signup/review");
  }

  return (
    <OnboardingStep
      id="services"
      title={step.title}
      lede={step.lede}
      contentClassName="pb-4 pt-4"
      footer={
        <>
          {showProblem && problems.categoryCodes ? (
            <Text className="text-caption text-error">{problems.categoryCodes}</Text>
          ) : null}
          <PrimaryButton label="Continue" onPress={next} />
        </>
      }
    >
      <View className="gap-4">
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">
            {IN_HOUSE_ONBOARDING.title}
          </Text>
          <Text className="text-body text-text-secondary">{IN_HOUSE_ONBOARDING.body}</Text>
        </View>
        <CategoryRankList
          categories={PUBLISHED_CATALOG.map((category) => ({
            code: category.code,
            name: category.name,
            bestFor: category.audience,
            products: category.services,
          }))}
          value={draft.categoryCodes}
          onToggle={(code) => patch({ categoryCodes: toggleCategory(draft.categoryCodes, code) })}
          onPromote={(code) => patch({ categoryCodes: promoteCategory(draft.categoryCodes, code) })}
        />
      </View>
    </OnboardingStep>
  );
}
