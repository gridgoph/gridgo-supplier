import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";

import { OnboardingStep } from "@/components/OnboardingStep";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ShopLocationPicker } from "@/components/ShopLocationPicker";
import { hasProblems, locationStepProblems, stepAt } from "@/lib/onboardingSteps";
import { useSignupDraft } from "@/store/signupDraft";

/**
 * Step two: the pin.
 *
 * This is the one screen in onboarding where getting it roughly right costs a
 * shop money forever — GRIDGO measures every delivery fee from this point — so
 * the map gets the whole screen and the step will not move on without it.
 */
export default function ShopLocationStep() {
  const draft = useSignupDraft((s) => s.draft);
  const patch = useSignupDraft((s) => s.patch);
  const [showProblem, setShowProblem] = useState(false);

  const step = stepAt("location");
  const problems = locationStepProblems(draft);

  function next() {
    if (hasProblems(problems)) {
      setShowProblem(true);
      return;
    }
    router.push("/(auth)/signup/services");
  }

  return (
    <OnboardingStep
      id="location"
      title={step.title}
      lede={step.lede}
      fill
      footer={
        <>
          {showProblem && problems.pin ? (
            <Text className="text-caption text-error">{problems.pin}</Text>
          ) : null}
          <PrimaryButton label="Use this pin" onPress={next} />
        </>
      }
    >
      <ShopLocationPicker pin={draft.pin} onChange={(pin) => patch({ pin })} />
    </OnboardingStep>
  );
}
