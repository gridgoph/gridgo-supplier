import { PrivacyPolicyLink } from "@/components/AccountPrivacy";
import { useState } from "react";
import { View } from "react-native";

import { BusyOverlay } from "@/components/BusyOverlay";
import { ErrorNotice } from "@/components/ErrorNotice";
import { JobTicketCode } from "@/components/JobTicketCode";
import { OnboardingStep } from "@/components/OnboardingStep";
import { PrimaryButton } from "@/components/PrimaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { PasswordField } from "@/components/controls/PasswordField";
import { TextField } from "@/components/controls/TextField";
import { useApplyEntry, useClerkSignUpFlow } from "@/hooks/useApplyEntry";
import { isEmailish } from "@/lib/onboardingSteps";
import { PASSWORD_RULE, passwordLengthProblem } from "@/lib/signup";
import { useSignupDraft } from "@/store/signupDraft";

/**
 * The sign-in, made before the shop (gridgo-supplier#265).
 *
 * Guided sign-up saves each step on GRIDGO, which needs a session to save
 * against — and a draft saved there is what lets a shop owner put the phone
 * down mid-way and pick up where they stopped. Two fields, then the code.
 */
export default function SignupAccountStep() {
  const draft = useSignupDraft((s) => s.draft);
  const patch = useSignupDraft((s) => s.patch);
  const flow = useClerkSignUpFlow();
  const { enter, entering, entryError } = useApplyEntry();
  const [showProblems, setShowProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");

  const emailProblem = isEmailish(draft.email) ? null : "Enter your email, like you@gmail.com.";
  const passwordProblem = passwordLengthProblem(draft.password);
  const error = flow.error ?? entryError;

  async function create() {
    if (emailProblem || passwordProblem) {
      setShowProblems(true);
      return;
    }
    setBusy(true);
    try {
      const outcome = await flow.create({ email: draft.email, password: draft.password });
      if (outcome === "ready") await enter();
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.replace(/\D/g, "").length < 6) return;
    setBusy(true);
    try {
      const outcome = await flow.verify(code);
      if (outcome === "ready") await enter();
    } finally {
      setBusy(false);
    }
  }

  const working = busy || entering;

  return (
    <OnboardingStep
      progress={{ label: "Takes 1 min", now: 0, max: 6 }}
      title={flow.awaitingCode ? "Check your email" : "Make your sign-in"}
      lede={flow.awaitingCode ? "" : "You sign in with this on any phone. Your setup is saved as you go."}
      contentClassName="gap-6 pb-4 pt-4"
      overlay={<BusyOverlay visible={working && !flow.awaitingCode} label="Making your sign-in…" />}
      footer={
        flow.awaitingCode ? null : (
          <>
            {error ? <ErrorNotice message={error} /> : null}
            <PrimaryButton label="Continue" hint="Padayon" disabled={working} onPress={() => void create()} />
          </>
        )
      }
    >
      {flow.awaitingCode ? (
        <JobTicketCode
          title=""
          email={draft.email.trim()}
          value={code}
          onChange={setCode}
          onVerify={() => void verify()}
          onResend={() => void flow.resend()}
          busy={working}
          error={error}
        />
      ) : (
        <>
          <FieldShell label="Email" error={showProblems ? emailProblem : null}>
            <TextField
              value={draft.email}
              onChange={(email) => patch({ email })}
              kind="email"
              placeholder="you@gmail.com"
              accessibilityLabel="Email"
            />
          </FieldShell>
          <FieldShell label="Password" hint={PASSWORD_RULE} error={showProblems ? passwordProblem : null}>
            <PasswordField
              value={draft.password}
              onChange={(password) => patch({ password })}
              kind="new-password"
              placeholder="Choose a password"
              accessibilityLabel="Password"
              returnKeyType="done"
              onSubmit={() => void create()}
            />
          </FieldShell>
          <PrivacyPolicyLink />
        </>
      )}
      {/* Clerk's bot check mounts here on web. */}
      <View nativeID="clerk-captcha" />
    </OnboardingStep>
  );
}
