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
  isHomeKind,
  ROLE_OPTIONS,
  shopKindOptions,
  type Eligibility,
} from "@/lib/guidedSignup";
import { HOME_NOT_OPEN_YET, homePrintingOffered, type HomeOffer } from "@/lib/homePrinter";
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
 * "I print from home" (gridgo-api#412) is drawn only when GRIDGO offers home
 * printing, so an older API keeps today's two questions. A home printer is
 * its own owner, so the owner question goes away for them.
 */
export default function SignupStartStep() {
  const { isSignedIn } = useAuth();
  const draft = useSignupDraft((s) => s.draft);
  const patch = useSignupDraft((s) => s.patch);
  const { enter, entering, entryError } = useApplyEntry();
  const [showProblems, setShowProblems] = useState(false);
  // Sent back here because GRIDGO did not take home printing: answer again, no auto-entry.
  const [checking, setChecking] = useState(Boolean(isSignedIn) && !useGuidedSignup.getState().homeUnavailable);
  const checked = useRef(false);
  // Shown unless GRIDGO said it does not take home printers (see `homeKindHonoured`).
  const [offer, setOffer] = useState<HomeOffer>("unknown");
  const homeUnavailable = useGuidedSignup((s) => s.homeUnavailable);
  const homeOffered = offer === "offered" || (offer === "unknown" && !homeUnavailable);

  useEffect(() => {
    let live = true;
    void homePrintingOffered().then((answer) => {
      if (live) setOffer(answer);
    });
    return () => {
      live = false;
    };
  }, []);

  const stored: Eligibility = draft.eligibility ?? EMPTY_ELIGIBILITY;
  // A home choice kept from a GRIDGO that offered it is dropped where it is not.
  const value: Eligibility = !homeOffered && isHomeKind(stored) ? { ...stored, shopKind: null } : stored;
  const home = isHomeKind(value);
  const problems = eligibilityProblems(value);
  const problem = (field: keyof Eligibility) => (showProblems ? (problems[field] ?? null) : null);

  // Signed in already (back from Sign in, or reopening the app): GRIDGO knows
  // where this sign-up stands, unless step 0 has not been answered anywhere.
  useEffect(() => {
    if (!isSignedIn || checked.current || useGuidedSignup.getState().homeUnavailable) return;
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
      progress={{ label: "Takes 30 sec", now: 0, max: home ? 5 : 6 }}
      title="Tell us about you"
      lede={
        home
          ? "Two quick answers. Then you're about 5 minutes from printing."
          : "Three quick answers. Then your shop is about 5 minutes away."
      }
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
          options={shopKindOptions(homeOffered)}
          value={value.shopKind}
          onChange={(shopKind) => edit({ shopKind })}
          accessibilityLabel="Where do you print?"
        />
      </FieldShell>

      {homeUnavailable ? (
        <Text className="-mt-3 text-caption text-text-muted" testID="home-not-open">
          {HOME_NOT_OPEN_YET}
        </Text>
      ) : null}

      {home ? (
        <Text className="-mt-3 text-caption text-text-muted" testID="home-kind-note">
          {"No shop hours: you go online when you're ready. Clients only ever see your barangay."}
        </Text>
      ) : null}

      {home ? null : (
        <FieldShell label="Are you the owner?" error={problem("registrantRole")}>
          <OptionList
            options={ROLE_OPTIONS}
            value={value.registrantRole}
            onChange={(registrantRole) => edit({ registrantRole })}
            accessibilityLabel="Are you the owner?"
          />
        </FieldShell>
      )}
      {!home && value.registrantRole === "manager" ? (
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
