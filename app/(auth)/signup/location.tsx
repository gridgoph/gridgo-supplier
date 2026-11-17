import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Text, View } from "react-native";
import type { KeyboardAwareScrollViewRef } from "react-native-keyboard-controller";

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
 * the map keeps room for the pin and the step will not move on without it.
 */
export default function ShopLocationStep() {
  const draft = useSignupDraft((s) => s.draft);
  const patch = useSignupDraft((s) => s.patch);
  const [showProblem, setShowProblem] = useState(false);
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const pickerTop = useRef(0);
  const [searchFocused, setSearchFocused] = useState(false);
  // Outside Davao City by the address lookup, or a move still being read.
  const [blocker, setBlocker] = useState<string | null>(null);

  useEffect(() => {
    if (!searchFocused) return;
    const showMap = () => scrollRef.current?.scrollTo({ y: pickerTop.current, animated: false });
    showMap();
    // Before the keyboard opens, the scroll range can be too short to reach
    // the picker. Repeat once the keyboard has made that room available.
    const subscription = Keyboard.addListener("keyboardDidShow", showMap);
    return () => subscription.remove();
  }, [searchFocused]);

  const step = stepAt("location");
  const problems = locationStepProblems(draft);
  const problem = blocker ?? problems.pin;

  function next() {
    if (blocker || hasProblems(problems)) {
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
      scrollRef={scrollRef}
      footer={
        <>
          {showProblem && problem ? (
            <Text className="text-caption text-error">{problem}</Text>
          ) : null}
          <PrimaryButton label="Use this pin" onPress={next} />
        </>
      }
    >
      <View
        testID="signup-location-picker"
        onLayout={(event) => {
          pickerTop.current = event.nativeEvent.layout.y;
        }}
      >
        <ShopLocationPicker
          pin={draft.pin}
          onChange={(pin) => patch({ pin })}
          searchPlaceholder="Search address"
          onSearchFocusChange={setSearchFocused}
          onBlockerChange={setBlocker}
        />
      </View>
    </OnboardingStep>
  );
}
