import { useAuth } from "@clerk/expo";
import { Stack, router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { BusyOverlay } from "@/components/BusyOverlay";
import { ErrorNotice } from "@/components/ErrorNotice";
import { OnboardingStep } from "@/components/OnboardingStep";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SupplierTermsNotice } from "@/components/SupplierTermsNotice";
import { OptionList } from "@/components/controls/OptionList";
import { ApplyConsentFields } from "@/components/legal/ApplyConsentFields";
import * as api from "@/lib/api";
import { awaitClerkSessionToken } from "@/lib/clerk";
import { currentMission, isHomeSignup, missionProgress, readyToEnroll } from "@/lib/guidedSignup";
import {
  APPLY_CONSENT_REFUSED,
  applyDocuments,
  EMPTY_APPLY_CONSENT,
  enrollmentConsentBody,
  type ApplyConsent,
} from "@/lib/legal";
import { legalContext } from "@/lib/legalContext";
import { enrollmentIdempotencyKey } from "@/lib/signup";
import { attachSignupLogo } from "@/lib/signupAfterEnroll";
import { useGuidedStepDraft } from "@/hooks/useApplyEntry";
import { useGuidedSignup } from "@/store/guidedSignup";
import { useLegalLibrary } from "@/store/legalLibrary";
import { useSession } from "@/store/session";
import { useSignupDraft } from "@/store/signupDraft";

const CHOICES = [
  { value: "just_me", label: "Just me", detail: "Ako ra · You take and print every job." },
  {
    value: "me_and_staff",
    label: "Me and staff",
    detail: "Ako ug akong staff · Staff take jobs, never see money.",
  },
] as const;

/**
 * Mission 4: who takes jobs — and the moment the shop opens
 * (gridgo-supplier#265).
 *
 * GRIDGO needs this answer to open the shop, so the step that asks it is
 * also the step that agrees to the terms and opens the account. Everything
 * the shop typed so far is already on GRIDGO; enrollment names the draft's
 * version rather than repeating it. Adding the staff themselves happens on
 * the Team screen once the shop exists.
 */
export default function SignupOpenShopStep() {
  useGuidedStepDraft();
  const { getToken } = useAuth();
  const signup = useGuidedSignup((s) => s.signup);
  const draft = useSignupDraft((s) => s.draft);
  const patch = useSignupDraft((s) => s.patch);
  const clearDraft = useSignupDraft((s) => s.clear);
  const { enrollSupplier, error, clearError } = useSession();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [consent, setConsent] = useState<ApplyConsent>(EMPTY_APPLY_CONSENT);
  const [consentProblem, setConsentProblem] = useState(false);
  const libraryStatus = useLegalLibrary((s) => s.status);
  const documents = applyDocuments(useLegalLibrary((s) => s.documents));
  const legacyLegal = libraryStatus === "unsupported";
  const ready = readyToEnroll(signup);
  const missing = ready ? null : currentMission(signup);
  // A home printer prints alone: no staff question, and "account", not "shop".
  const home = isHomeSignup(signup);

  useEffect(() => {
    void useLegalLibrary.getState().load({ force: true });
  }, []);

  async function open() {
    clearError();
    setLocalError(null);
    if (!signup || !ready) {
      setLocalError(missing ? `Finish "${missing.title}" first.` : "Finish the earlier steps first.");
      return;
    }
    if (!legacyLegal && (!documents || !consent.agreed)) {
      setConsentProblem(true);
      return;
    }
    setBusy(true);
    try {
      api.setTokenProvider(getToken);
      if (!(await awaitClerkSessionToken(getToken))) {
        setLocalError("GRIDGO could not confirm your sign-in. Wait a moment and try again.");
        return;
      }
      const key = enrollmentIdempotencyKey(draft.enrollKey);
      if (key !== draft.enrollKey) patch({ enrollKey: key });
      const body: api.GuidedSupplierEnrollment = {
        signupVersion: signup.version,
        jobsHandledBy: home ? "just_me" : (draft.jobsHandledBy ?? "just_me"),
      };
      if (!legacyLegal && documents) {
        body.legalConsentVersion = api.LEGAL_CONSENT_VERSION;
        body.legalConsent = enrollmentConsentBody(
          documents.map((doc) => doc.id),
          consent,
          await legalContext(),
        );
      }
      const created = await enrollSupplier(body, key);
      if (!created) {
        if (useSession.getState().error === APPLY_CONSENT_REFUSED) {
          setConsent((current) => ({ ...current, agreed: false }));
          patch({ enrollKey: "" });
          void useLegalLibrary.getState().load({ force: true });
        }
        return;
      }
      void attachSignupLogo(draft.logo);
      clearDraft();
      router.replace("/setup");
    } finally {
      setBusy(false);
    }
  }

  const shownError = localError ?? error;

  return (
    <>
      {home ? <Stack.Screen options={{ title: "Open your account" }} /> : null}
      <OnboardingStep
        progress={missionProgress("staff", home)}
        title={home ? "Open your account" : "Who takes jobs?"}
        lede={
          home
            ? "Agree to GRIDGO's terms and your account opens."
            : "Answer this and your shop opens. You add staff on the next screen."
        }
        contentClassName="gap-6 pb-4 pt-4"
        overlay={
          <BusyOverlay
            visible={busy}
            label={
              home
                ? "Opening your account. Do not close the app."
                : "Opening your shop. Do not close the app."
            }
          />
        }
        footer={
          <>
            {consentProblem ? (
              <Text className="text-caption text-error">
                {home
                  ? "Tick the agreement below to open your account."
                  : "Tick the agreement below to open your shop."}
              </Text>
            ) : null}
            {shownError ? <ErrorNotice message={shownError} /> : null}
            <PrimaryButton
              label={busy ? "Opening…" : home ? "Open my account" : "Open my shop"}
              hint={home ? "Ablihi akong account" : "Ablihi akong tindahan"}
              disabled={busy}
              onPress={() => void open()}
            />
          </>
        }
      >
        {home ? null : (
          <OptionList
            options={CHOICES}
            value={draft.jobsHandledBy ?? "just_me"}
            onChange={(jobsHandledBy) => patch({ jobsHandledBy })}
            accessibilityLabel="Who takes jobs"
          />
        )}
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">After you open</Text>
          <Text className="text-body text-text-secondary">
            {home
              ? "Where you get paid, then Starter: your ID, a selfie with it and a test print."
              : "Two short steps left: your hours, and where you get paid."}
          </Text>
        </View>
        <SupplierTermsNotice />
        <ApplyConsentFields
          consent={consent}
          onChange={(next) => {
            setConsent(next);
            setConsentProblem(false);
          }}
          documents={documents}
          status={libraryStatus}
          onRetry={() => void useLegalLibrary.getState().load({ force: true })}
          showProblem={consentProblem}
          disabled={busy}
        />
      </OnboardingStep>
    </>
  );
}
