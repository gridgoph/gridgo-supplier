import { useAuth } from "@clerk/expo";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { OnboardingStep } from "@/components/OnboardingStep";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SessionWait } from "@/components/SessionWait";
import { CheckboxRow } from "@/components/controls/CheckboxRow";
import { FieldShell } from "@/components/controls/FieldShell";
import { OptionList } from "@/components/controls/OptionList";
import { useApplyEntry } from "@/hooks/useApplyEntry";
import {
  EMPTY_ELIGIBILITY,
  eligibilityProblems,
  ROLE_OPTIONS,
  SHOP_KIND_OPTIONS,
  type Eligibility,
} from "@/lib/guidedSignup";
import { useGuidedSignup } from "@/store/guidedSignup";
import { useSignupDraft } from "@/store/signupDraft";

/**
 * Step 0: three answers before anything else (gridgo-supplier#265).
 *
 * Asked before the sign-in exists, so nobody under 18 is asked for an email
 * first. The answers wait on the phone until there is a session to save them
 * with. A phone already signed in at Clerk goes straight to wherever GRIDGO
 * says the sign-up stands.
 *
 * Home printers are a choice GRIDGO records; their own rules are later work,
 * so nothing here treats them differently yet.
 */
export default function SignupStartStep() {
  const { isSignedIn } = useAuth();
  const draft = useSignupDraft((s) => s.draft);
  const patch = useSignupDraft((s) => s.patch);
  const { enter, entering, entryError } = useApplyEntry();
  const [showProblems, setShowProblems] = useState(false);
  const [checking, setChecking] = useState(Boolean(isSignedIn));
  const checked = useRef(false);

  const value: Eligibility = draft.eligibility ?? EMPTY_ELIGIBILITY;
  const problems = eligibilityProblems(value);
  const problem = (field: keyof Eligibility) => (showProblems ? (problems[field] ?? null) : null);

  // Signed in already (back from Sign in, or reopening the app): GRIDGO knows
  // where this sign-up stands, unless step 0 has not been answered anywhere.
  useEffect(() => {
    if (!isSignedIn || checked.current) return;
    checked.current = true;
    void (async () => {
      const local = useSignupDraft.getState().draft.eligibility;
      const answered = Boolean(local && !Object.keys(eligibilityProblems(local)).length);
      if (answered) {
        await enter();
      } else {
        const mode = await useGuidedSignup.getState().load();
        if (mode === "legacy" || useGuidedSignup.getState().signup?.steps.eligibility) await enter();
      }
      setChecking(false);
    })();
  }, [enter, isSignedIn]);

  function edit(next: Partial<Eligibility>) {
    patch({ eligibility: { ...value, ...next } });
  }

  async function next() {
    if (Object.keys(problems).length) {
      setShowProblems(true);
      return;
    }
    if (isSignedIn) {
      await enter();
      return;
    }
    router.push("/(auth)/signup/account");
  }

  if (checking) return <SessionWait tone="in" role="supplier" />;

  return (
    <OnboardingStep
      progress={{ label: "Takes 30 sec", now: 0, max: 6 }}
      title="Tell us about you"
      lede="Three quick answers. Then your shop is about 5 minutes away."
      contentClassName="gap-6 pb-4 pt-4"
      footer={
        <>
          {entryError ? <ErrorNotice message={entryError} /> : null}
          <PrimaryButton
            label={entering ? "Opening…" : "Start"}
            hint="Sugdi na"
            disabled={entering}
            onPress={() => void next()}
          />
          {isSignedIn ? null : (
            <SecondaryButton
              label="I already have an account"
              onPress={() => router.replace("/(auth)/login")}
            />
          )}
        </>
      }
    >
      <FieldShell label="Where do you print?" error={problem("shopKind")}>
        <OptionList
          options={SHOP_KIND_OPTIONS}
          value={value.shopKind}
          onChange={(shopKind) => edit({ shopKind })}
          accessibilityLabel="Where do you print?"
        />
      </FieldShell>

      <FieldShell label="Are you the owner?" error={problem("registrantRole")}>
        <OptionList
          options={ROLE_OPTIONS}
          value={value.registrantRole}
          onChange={(registrantRole) => edit({ registrantRole })}
          accessibilityLabel="Are you the owner?"
        />
      </FieldShell>
      {value.registrantRole === "manager" ? (
        <Text className="-mt-3 text-caption text-text-muted">
          {"You set up the shop. Your owner gets a link to claim it and sets where GRIDGO pays."}
        </Text>
      ) : null}

      <View className="gap-2">
        <CheckboxRow
          checked={value.adult}
          onChange={(adult) => edit({ adult })}
          label="I am 18 or older"
          hint="18 anyos pataas ko"
        />
        {problem("adult") ? <Text className="text-caption text-error">{problem("adult")}</Text> : null}
      </View>
    </OnboardingStep>
  );
}
