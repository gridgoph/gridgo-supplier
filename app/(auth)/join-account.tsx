import { useClerk, useSignUp } from "@clerk/expo";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { JobTicketCode } from "@/components/JobTicketCode";
import { PrimaryButton } from "@/components/PrimaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { PasswordField } from "@/components/controls/PasswordField";
import { TextField } from "@/components/controls/TextField";
import { clerkErrorMessage, isAlreadySignedInError, splitPersonName } from "@/lib/clerk";
import { continuationAfterSignUp } from "@/lib/clerkSignUp";
import { isEmailish } from "@/lib/onboardingSteps";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE, PASSWORD_TOO_SHORT } from "@/lib/signup";
import { useTeamJoin } from "@/store/teamJoin";

/**
 * A login for someone joining a shop's team.
 *
 * Only the person: name, email, password, and the emailed code. No shop is
 * opened — the join screen claims the invite next and the Owner approves.
 * Use the same email the Owner invited, so the invite finds you.
 */
export default function JoinAccountScreen() {
  const { signUp } = useSignUp();
  const { setActive } = useClerk();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const nameProblem = name.trim() ? null : "Add your name.";
  const emailProblem = isEmailish(email.trim()) ? null : "Add the email the owner invited.";
  const passwordProblem = password.length >= MIN_PASSWORD_LENGTH ? null : PASSWORD_TOO_SHORT;
  const ready = !nameProblem && !emailProblem && !passwordProblem;

  function done() {
    useTeamJoin.getState().startJoining();
    router.dismissTo("/join-team");
  }

  async function finish(): Promise<void> {
    if (!signUp) return;
    const next = continuationAfterSignUp({
      status: signUp.status,
      unverifiedFields: signUp.unverifiedFields,
      missingFields: signUp.missingFields,
      existingSession: signUp.existingSession,
    });
    if (next.kind === "existing_session") {
      await setActive({ session: next.sessionId }).catch(() => undefined);
      done();
      return;
    }
    if (next.kind === "complete") {
      const finalized = await signUp.finalize();
      if (finalized.error && !isAlreadySignedInError(finalized.error)) throw finalized.error;
      done();
      return;
    }
    if (next.kind === "email_code") {
      if (verifying) throw new Error("Your email is checked, but the login still needs attention.");
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) throw sent.error;
      setVerifying(true);
      return;
    }
    setProblem(next.message);
  }

  async function create() {
    setTried(true);
    if (!signUp || !ready) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await signUp.password({
        emailAddress: email.trim().toLowerCase(),
        password,
        ...splitPersonName(name.trim()),
      });
      if (result.error) {
        if (isAlreadySignedInError(result.error)) {
          done();
          return;
        }
        throw result.error;
      }
      await finish();
    } catch (error) {
      setProblem(clerkErrorMessage(error, "GRIDGO could not make your login. Check your details and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    const typed = code.replace(/\D/g, "");
    if (!signUp || typed.length < 6) return;
    setBusy(true);
    setProblem(null);
    try {
      const checked = await signUp.verifications.verifyEmailCode({ code: typed });
      if (checked.error) throw checked.error;
      await finish();
    } catch (error) {
      setProblem(clerkErrorMessage(error, "That code could not be verified."));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!signUp) return;
    setBusy(true);
    setProblem(null);
    try {
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) throw sent.error;
    } catch (error) {
      setProblem(clerkErrorMessage(error, "GRIDGO could not send another code. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (verifying) {
    return (
      <FormScrollView contentClassName="gg-page gap-4 pb-10 pt-6">
        <JobTicketCode
          title="Check your email"
          email={email.trim()}
          value={code}
          onChange={setCode}
          onVerify={() => void verify()}
          onResend={() => void resend()}
          busy={busy}
          error={problem}
        />
      </FormScrollView>
    );
  }

  return (
    <FormScrollView contentClassName="gg-page gap-5 pb-10 pt-6">
      <View className="gap-2">
        <Text className="text-h1 text-text-primary" accessibilityRole="header">
          Your login
        </Text>
        <Text className="text-body-lg text-text-secondary">Use the email the owner invited.</Text>
      </View>
      <FieldShell label="Your name" error={tried ? nameProblem : null}>
        <TextField value={name} onChange={setName} kind="name" placeholder="Sam Santos" accessibilityLabel="Your name" />
      </FieldShell>
      <FieldShell label="Email" error={tried ? emailProblem : null}>
        <TextField
          value={email}
          onChange={setEmail}
          kind="email"
          placeholder="you@example.com"
          accessibilityLabel="Email"
        />
      </FieldShell>
      <FieldShell label="Password" hint={PASSWORD_RULE} error={tried ? passwordProblem : null}>
        <PasswordField
          value={password}
          onChange={setPassword}
          kind="new-password"
          placeholder="Choose a password"
          accessibilityLabel="Password"
          returnKeyType="done"
          onSubmit={() => void create()}
        />
      </FieldShell>
      {problem ? <ErrorNotice message={problem} /> : null}
      <PrimaryButton
        label={busy ? "Making your login…" : "Make my login"}
        disabled={busy}
        onPress={() => void create()}
      />
    </FormScrollView>
  );
}
