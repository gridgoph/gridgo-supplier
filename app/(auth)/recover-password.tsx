import { useAuth, useSignIn } from "@clerk/expo";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { GridgoLogo } from "@/components/GridgoLogo";
import { JobTicketCode } from "@/components/JobTicketCode";
import { PrimaryButton } from "@/components/PrimaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { PasswordField } from "@/components/controls/PasswordField";
import { TextField } from "@/components/controls/TextField";
import { enterAfterClerkSession, hrefAfterClerkAuth, prepareApplyDraft } from "@/lib/afterClerkAuth";
import { clerkErrorMessage, type ClerkGetToken } from "@/lib/clerk";

type Step = "email" | "code" | "password";

export default function RecoverPasswordScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const { getToken } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function sendCode() {
    if (!email.trim()) return;
    await run(async () => {
      const started = await signIn.create({ identifier: email.trim() });
      if (started.error) throw started.error;
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) throw sent.error;
      setStep("code");
    }, "GRIDGO could not send a recovery code. Check the email and try again.");
  }

  async function verifyCode() {
    const typed = code.replace(/\D/g, "");
    if (typed.length < 6) return;
    await run(async () => {
      const verified = await signIn.resetPasswordEmailCode.verifyCode({ code: typed });
      if (verified.error) throw verified.error;
      setStep("password");
    }, "That recovery code was not accepted. Check it and try again.");
  }

  async function resendCode() {
    await run(async () => {
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) throw sent.error;
    }, "GRIDGO could not send another code. Try again.");
  }

  async function savePassword() {
    if (!password) return;
    if (password !== confirmation) {
      setProblem("The two passwords do not match.");
      return;
    }
    await run(async () => {
      const submitted = await signIn.resetPasswordEmailCode.submitPassword({ password });
      if (submitted.error) throw submitted.error;
      const completed = await signIn.finalize();
      if (completed.error) throw completed.error;
      const next = await enterAfterClerkSession(getToken as ClerkGetToken);
      if (next.kind === "blocked") throw new Error(next.message);
      if (next.kind === "apply") prepareApplyDraft(email);
      router.replace(hrefAfterClerkAuth(next));
    }, "GRIDGO could not save that password. Try again.");
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (error) {
      setProblem(clerkErrorMessage(error, fallback));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gg-screen">
      <FormScrollView fillHeight contentClassName="gg-page grow justify-center pb-10 pt-6">
        <GridgoLogo size={48} role="supplier" />
        {step === "code" ? (
          <View className="mt-8">
            <JobTicketCode
              email={email.trim()}
              value={code}
              onChange={setCode}
              onVerify={() => void verifyCode()}
              onResend={() => void resendCode()}
              verifyLabel="Verify email"
              busy={busy || fetchStatus === "fetching"}
              error={problem}
            />
          </View>
        ) : (
          <>
            <View className="mt-8 gap-2">
              <Text className="text-h1 text-text-primary">Recover Password</Text>
              <Text className="text-body-lg text-text-secondary">{ledeFor(step)}</Text>
            </View>

            <View className="mt-8 gap-4">
              {step === "email" ? (
                <FieldShell label="Email">
                  <TextField
                    value={email}
                    onChange={setEmail}
                    kind="email"
                    placeholder="you@yourshop.ph"
                    accessibilityLabel="Email"
                    returnKeyType="go"
                    onSubmit={() => void sendCode()}
                  />
                </FieldShell>
              ) : (
                <>
                  <FieldShell label="New password">
                    <PasswordField
                      value={password}
                      onChange={setPassword}
                      kind="new-password"
                      placeholder="At least 8 characters"
                      accessibilityLabel="New password"
                    />
                  </FieldShell>
                  <FieldShell label="Confirm password">
                    <PasswordField
                      value={confirmation}
                      onChange={setConfirmation}
                      kind="new-password"
                      placeholder="Type it again"
                      accessibilityLabel="Confirm new password"
                      returnKeyType="go"
                      onSubmit={() => void savePassword()}
                    />
                  </FieldShell>
                </>
              )}
            </View>

            {problem ? (
              <View className="mt-4">
                <ErrorNotice message={problem} />
              </View>
            ) : null}

            <View className="mt-6 gap-3">
              <PrimaryButton
                label={busy ? "Working…" : buttonFor(step)}
                disabled={busy || fetchStatus === "fetching"}
                onPress={() => void (step === "email" ? sendCode() : savePassword())}
              />
            </View>
          </>
        )}
      </FormScrollView>
    </View>
  );
}

function ledeFor(step: Exclude<Step, "code">): string {
  if (step === "email") return "We’ll send a recovery code to your shop email.";
  return "Choose a new password for this supplier account.";
}

function buttonFor(step: Exclude<Step, "code">): string {
  if (step === "email") return "Send recovery code";
  return "Save new password";
}
