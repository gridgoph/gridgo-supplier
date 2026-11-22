import { useAuth, useClerk, useSignIn } from "@clerk/expo";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { JobTicketCode } from "@/components/JobTicketCode";
import { PrimaryButton } from "@/components/PrimaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { TextField } from "@/components/controls/TextField";
import { emailUnavailableMessage, enterAfterClerkSession, hrefAfterClerkAuth } from "@/lib/afterClerkAuth";
import { PhoneUnavailable } from "@/components/team/PhoneUnavailable";
import { clerkErrorMessage, isPhoneUnavailableError, type ClerkGetToken } from "@/lib/clerk";
import { clerkSignOutRecoveryMessage, releaseClerkSession } from "@/lib/clerkSignIn";
import { normalizeInviteIdentity } from "@/lib/shopTeam";
import { useSession } from "@/store/session";

/**
 * Sign in with a mobile and a texted 6-digit code (report F315793B).
 *
 * A teammate who joined by link or QR made their login with only a name and
 * a mobile — no email, no password — so this is their way back after signing
 * out, a session ending, or a new phone. It signs in to the same Clerk login,
 * never a second one: Clerk finds the account by the number, and GRIDGO's
 * membership is on that account. A join still in progress (a link opened
 * first) carries on at the join screen.
 */
export default function PhoneSignInScreen() {
  const { signIn } = useSignIn();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const phone = normalizeInviteIdentity("phone", mobile);
  const mobileProblem = phone ? null : "Check the number. It looks like 0917 123 4567.";

  async function sendCode() {
    setTried(true);
    if (!phone || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await signIn.phoneCode.sendCode({ phoneNumber: phone });
      if (result.error) throw result.error;
      setSent(true);
    } catch (error) {
      if (isPhoneUnavailableError(error)) {
        setUnavailable(true);
        return;
      }
      setProblem(clerkErrorMessage(error, "GRIDGO could not text a code to that number. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    const typed = code.replace(/\D/g, "");
    if (typed.length < 6 || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const checked = await signIn.phoneCode.verifyCode({ code: typed });
      if (checked.error) throw checked.error;
      if (signIn.status !== "complete") {
        setProblem("Your number is checked, but this login needs another step. Sign in with your email instead.");
        return;
      }
      const done = await signIn.finalize();
      if (done.error) throw done.error;
      await enter();
    } catch (error) {
      setProblem(clerkErrorMessage(error, "That code could not be verified."));
    } finally {
      setBusy(false);
    }
  }

  async function enter() {
    useSession.getState().beginSessionWait("in");
    const next = await enterAfterClerkSession(getToken as ClerkGetToken);
    if (next.kind === "access" || (next.kind === "blocked" && next.message === emailUnavailableMessage)) {
      useSession.getState().refuseSignIn();
      setProblem(emailUnavailableMessage);
      if (!(await releaseClerkSession(() => signOut()))) setProblem(clerkSignOutRecoveryMessage);
      return;
    }
    if (next.kind === "blocked") {
      useSession.getState().clearSessionWait();
      setProblem(next.message);
      return;
    }
    if (next.kind === "join" || next.kind === "team_removed") useSession.getState().clearSessionWait();
    if (next.kind === "team_removed") return;
    if (next.kind === "join") {
      router.dismissTo("/join-team");
      return;
    }
    router.replace(hrefAfterClerkAuth(next));
  }

  if (sent) {
    return (
      <FormScrollView contentClassName="gg-page gap-5 py-6">
        <JobTicketCode
          title="Check your texts"
          email={mobile.trim()}
          value={code}
          onChange={setCode}
          onVerify={() => void verify()}
          onResend={() => void sendCode()}
          busy={busy}
          verifyLabel="Sign in"
        />
        {problem ? <ErrorNotice message={problem} /> : null}
      </FormScrollView>
    );
  }

  return (
    <FormScrollView contentClassName="gg-page gap-5 py-6">
      <View className="gap-1">
        <Text className="text-h1 text-text-primary">Sign in with your mobile</Text>
        <Text className="text-body-lg text-text-secondary">
          For staff who joined with their mobile. We text you a 6-digit code.
        </Text>
      </View>
      <FieldShell label="Your mobile" error={tried ? mobileProblem : null}>
        <TextField
          value={mobile}
          onChange={setMobile}
          kind="phone"
          placeholder="0917 123 4567"
          accessibilityLabel="Your mobile"
          returnKeyType="done"
          onSubmit={() => void sendCode()}
        />
      </FieldShell>
      {problem ? <ErrorNotice message={problem} /> : null}
      {unavailable ? (
        // Back to Sign in, where email, password and Google still work.
        <PhoneUnavailable moment="sign_in" onEmail={() => router.dismissTo("/(auth)/login")} />
      ) : (
        <PrimaryButton label={busy ? "Sending…" : "Send my code"} disabled={busy} onPress={() => void sendCode()} />
      )}
    </FormScrollView>
  );
}
