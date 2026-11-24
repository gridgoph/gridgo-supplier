import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Text, View } from "react-native";
import type { KeyboardAwareScrollViewRef } from "react-native-keyboard-controller";

import { BusyOverlay } from "@/components/BusyOverlay";
import { ErrorNotice } from "@/components/ErrorNotice";
import { OnboardingStep } from "@/components/OnboardingStep";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ShopLocationPicker } from "@/components/ShopLocationPicker";
import { CheckboxRow } from "@/components/controls/CheckboxRow";
import { locationValue, missionProgress, pinStepProblem } from "@/lib/guidedSignup";
import { returnToMissions, useGuidedStepDraft } from "@/hooks/useApplyEntry";
import { useGuidedSignup } from "@/store/guidedSignup";
import { useSignupDraft } from "@/store/signupDraft";

/**
 * Mission 2: the pin, and the one consent it needs (gridgo-supplier#265).
 *
 * The consent is GRIDGO's own sentence, drawn and sent back word for word:
 * GRIDGO stores the wording with the time it received it, and refuses any
 * other wording. Nothing here paraphrases it.
 */
export default function SignupPinStep() {
  useGuidedStepDraft();
  const signup = useGuidedSignup((s) => s.signup);
  const terms = useGuidedSignup((s) => s.terms);
  const save = useGuidedSignup((s) => s.save);
  const draft = useSignupDraft((s) => s.draft);
  const patch = useSignupDraft((s) => s.patch);
  const saved = signup?.steps.location;
  const [consented, setConsented] = useState(Boolean(saved));
  const [showProblem, setShowProblem] = useState(false);
  const [blocker, setBlocker] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const pickerTop = useRef(0);
  const [searchFocused, setSearchFocused] = useState(false);

  // Resume: the saved pin, if the phone has none of its own.
  useEffect(() => {
    if (saved && !draft.pin) patch({ pin: saved.point });
  }, [draft.pin, patch, saved]);

  useEffect(() => {
    if (!searchFocused) return;
    const showMap = () => scrollRef.current?.scrollTo({ y: pickerTop.current, animated: false });
    showMap();
    const subscription = Keyboard.addListener("keyboardDidShow", showMap);
    return () => subscription.remove();
  }, [searchFocused]);

  const wording = terms?.locationConsentWording ?? "";
  const problem = blocker ?? pinStepProblem(draft.pin, consented);

  async function next() {
    setError(null);
    if (problem || !draft.pin) {
      setShowProblem(true);
      return;
    }
    const value = locationValue(draft.pin, wording);
    if (!value) {
      setShowProblem(true);
      return;
    }
    setBusy(true);
    const result = await save("location", value);
    setBusy(false);
    if (result.status === "ok") returnToMissions();
    else if (result.status === "enrolled") router.replace("/(auth)/signup/missions");
    else setError(result.status === "failed" ? result.message : "Try again in a moment.");
  }

  return (
    <OnboardingStep
      progress={missionProgress("pin")}
      title="Pin your shop"
      lede="Riders come to this pin, and delivery fees start here."
      fill
      scrollRef={scrollRef}
      overlay={<BusyOverlay visible={busy} label="Saving…" />}
      footer={
        <>
          {/* In the footer so the one required tick is never below the map. */}
          {wording ? (
            <View testID="location-consent">
              <CheckboxRow checked={consented} onChange={setConsented} label={wording} />
            </View>
          ) : null}
          {showProblem && problem ? <Text className="text-caption text-error">{problem}</Text> : null}
          {error ? <ErrorNotice message={error} /> : null}
          <PrimaryButton label="Use this pin" hint="Gamita kini" disabled={busy} onPress={() => void next()} />
        </>
      }
    >
      <View
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
