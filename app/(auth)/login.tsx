import { useAuth, useClerk, useSignIn, useUser } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AppleSignInButton } from "@/components/AppleSignInButton";
import { AuthDivider } from "@/components/AuthDivider";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FacebookSignInButton } from "@/components/FacebookSignInButton";
import { FormScrollView } from "@/components/FormScrollView";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { GridgoLogo } from "@/components/GridgoLogo";
import { JobTicketCode } from "@/components/JobTicketCode";
import { PrimaryButton } from "@/components/PrimaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { PasswordField } from "@/components/controls/PasswordField";
import { TextField } from "@/components/controls/TextField";
import {
  emailUnavailableMessage,
  enterAfterClerkSession,
  gridgoUnreachableMessage,
  hrefAfterClerkAuth,
  leftoverActionForTypedEmail,
  prepareApplyDraft,
  supplierDoorForClerkSession,
} from "@/lib/afterClerkAuth";
import { health } from "@/lib/api";
import {
  clerkAccessFor,
  clerkDisplayName,
  clerkErrorMessage,
  isAlreadySignedInError,
  type ClerkGetToken,
} from "@/lib/clerk";
import {
  clerkSignOutRecoveryMessage,
  continuationAfterSignIn,
  releaseClerkSession,
  withSettledClerkSession,
} from "@/lib/clerkSignIn";
import { SessionWait } from "@/components/SessionWait";
import { appleSignInOutcome, isAppleCancel, type AppleFlowResult } from "@/lib/appleSignIn";
import {
  FACEBOOK_CANCELLED,
  FACEBOOK_EMAIL_TAKEN,
  FACEBOOK_STRATEGY,
  FACEBOOK_UNAVAILABLE,
  facebookOutcome,
  isFacebookEmailTakenError,
} from "@/lib/facebookSignIn";
import { completeGoogleSso } from "@/lib/googleSso";
import { useFacebookOffered } from "@/hooks/useFacebookOffered";
import { SESSION_ENDED_MESSAGE, TEAM_REMOVED_DETAIL, TEAM_REMOVED_TITLE, useSession } from "@/store/session";
import { useSignInNotice } from "@/store/signInNotice";
import { isJoiningTeam, useTeamJoin } from "@/store/teamJoin";

type HealthState = "checking" | "reachable" | "unreachable";

export default function LoginScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const { isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const clerk = useClerk();
  const { setActive, signOut } = clerk;
  const facebookOffered = useFacebookOffered();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // A calm word, not an error: the person closed Facebook's window.
  const [notice, setNotice] = useState<string | null>(null);
  const [healthState, setHealthState] = useState<HealthState>("checking");
  const sessionWait = useSession((state) => state.sessionWait);
  const identity = useSession((state) => state.identity);
  // What a screen the ended session took down still had to say.
  const endedTaskNotice = useSignInNotice((state) => state.message);
  const shown =
    problem ??
    (identity.kind === "signed_out" && identity.reason === "refused" ? emailUnavailableMessage : null);

  useEffect(() => {
    let cancelled = false;
    void health()
      .then(() => {
        if (!cancelled) setHealthState("reachable");
      })
      .catch(() => {
        if (!cancelled) setHealthState("unreachable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The refusal is recorded in the session before Clerk signs out. Clerk's
  // session can close the door guard on its way out, which remounts the stack
  // on launch; launch reads the refusal and opens Sign in again with the
  // sentence, instead of Welcome with nothing said.
  async function refuseNonSupplier() {
    setVerifying(false);
    setProblem(emailUnavailableMessage);
    useSession.getState().refuseSignIn();
    await releaseClerkSession(() => signOut());
  }

  function startAttempt() {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    useSession.getState().clearSignInRefusal();
  }

  async function adoptAndEnter() {
    useSession.getState().beginSessionWait("in");
    const next = await enterAfterClerkSession(getToken as ClerkGetToken);
    if (next.kind === "blocked") {
      if (next.message === emailUnavailableMessage) {
        await refuseNonSupplier();
        return;
      }
      useSession.getState().clearSessionWait();
      setProblem(next.message);
      return;
    }
    if (next.kind === "access") {
      await refuseNonSupplier();
      return;
    }
    if (next.kind === "apply") {
      // Read the live Clerk user: right after Google, Apple or Facebook the
      // hook's copy can still be the signed-out one. The name is only a
      // default the shop can change on the apply form.
      const person = clerk.user ?? clerkUser;
      prepareApplyDraft(person?.primaryEmailAddress?.emailAddress, clerkDisplayName(person));
    }
    if (next.kind === "join" || next.kind === "team_removed") {
      useSession.getState().clearSessionWait();
    }
    // Removed from the team: the session is already ended and this screen
    // says why.
    if (next.kind === "team_removed") return;
    if (next.kind === "join") {
      // Back to the join screen that sent the person here, not a second copy.
      router.dismissTo("/join-team");
      return;
    }
    router.replace(hrefAfterClerkAuth(next));
  }

  async function sendEmailCode() {
    const sent = await signIn.mfa.sendEmailCode();
    if (sent.error) throw sent.error;
    setVerifying(true);
    setCode("");
  }

  async function continueSignIn(): Promise<"ready" | "email_code" | "blocked"> {
    const next = continuationAfterSignIn(signIn.status);
    if (next.kind === "complete") {
      const completed = await signIn.finalize();
      if (completed.error) throw completed.error;
      return "ready";
    }
    if (next.kind === "email_code") {
      let door = await supplierDoorForClerkSession(getToken as ClerkGetToken);
      if (door === "unknown") {
        try {
          const completed = await signIn.finalize();
          if (!completed.error) {
            door = await supplierDoorForClerkSession(getToken as ClerkGetToken);
          }
        } catch {
          // Clerk still wants a code — only a shop may be mailed one.
        }
      }
      // Someone joining a shop's team may sign in with a client or rider login.
      if (door === "wrong_app" && !isJoiningTeam()) {
        await refuseNonSupplier();
        return "blocked";
      }
      await sendEmailCode();
      return "email_code";
    }
    setProblem(next.message);
    return "blocked";
  }

  async function submitPassword() {
    if (!email.trim() || !password) return;
    startAttempt();
    try {
      const settled = await withSettledClerkSession({
        isSignedIn: Boolean(isSignedIn),
        settle: async (alreadySignedIn) => {
          if (!alreadySignedIn) return "ready";
          const leftoverAccess = clerkAccessFor(clerkUser?.publicMetadata);
          const leftoverDoor =
            leftoverAccess.kind === "mismatch"
              ? "wrong_app"
              : await supplierDoorForClerkSession(getToken as ClerkGetToken);
          if (
            leftoverActionForTypedEmail({
              leftoverEmail: clerkUser?.primaryEmailAddress?.emailAddress,
              typedEmail: email,
              leftoverDoor,
              leftoverAccess,
            }) === "refuse"
          ) {
            await refuseNonSupplier();
            return "handled";
          }
          if (!(await releaseClerkSession(() => signOut()))) {
            setProblem(clerkSignOutRecoveryMessage);
            return "handled";
          }
          return "ready";
        },
        run: async () => {
          const attempt = await signIn.password({
            identifier: email.trim(),
            password,
          });
          if (attempt.error) throw attempt.error;
          return continueSignIn();
        },
      });
      if (settled.kind === "handled") return;
      if (settled.value === "ready") await adoptAndEnter();
    } catch (error) {
      if (isAlreadySignedInError(error)) {
        setProblem(clerkSignOutRecoveryMessage);
        return;
      }
      setProblem(clerkErrorMessage(error, "GRIDGO could not sign you in just now. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmail() {
    const typed = code.replace(/\D/g, "");
    if (typed.length < 6) return;
    setBusy(true);
    setProblem(null);
    try {
      const checked = await signIn.mfa.verifyEmailCode({ code: typed });
      if (checked.error) throw checked.error;
      const next = await continueSignIn();
      if (next === "ready") await adoptAndEnter();
    } catch (error) {
      setProblem(clerkErrorMessage(error, "That code could not be verified."));
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setBusy(true);
    setProblem(null);
    try {
      await sendEmailCode();
    } catch (error) {
      setProblem(clerkErrorMessage(error, "GRIDGO could not send another code. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    startAttempt();
    try {
      const outcome = await completeGoogleSso({
        alreadySignedIn: Boolean(isSignedIn),
        startSSOFlow: () => startSSOFlow({ strategy: "oauth_google" }),
        setActive: (args) => setActive(args),
      });
      if (outcome.status === "cancelled") {
        useSession.getState().clearSessionWait();
        return;
      }
      if (outcome.status === "activated" || outcome.status === "already_signed_in") {
        useSession.getState().beginSessionWait("in");
        await adoptAndEnter();
        return;
      }
      // Native callback still adopting — it starts the wait once Google has returned.
    } catch (error) {
      useSession.getState().clearSessionWait();
      setProblem(clerkErrorMessage(error, "Google could not sign you in just now. Try again."));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Continue with Facebook. Clerk links a Facebook login to the GRIDGO person
   * who already holds its email, so this lands an existing shop in its own
   * account; a Facebook login without an email finishes on the next screen,
   * which asks for an email or mobile and its six-digit code.
   */
  async function continueWithFacebook() {
    startAttempt();
    try {
      if (isSignedIn) {
        useSession.getState().beginSessionWait("in");
        await adoptAndEnter();
        return;
      }
      const result = await startSSOFlow({ strategy: FACEBOOK_STRATEGY });
      const outcome = facebookOutcome(result);
      if (outcome.status === "activated") {
        await setActive({ session: outcome.sessionId });
        useSession.getState().beginSessionWait("in");
        await adoptAndEnter();
        return;
      }
      if (outcome.status === "needs_contact" || outcome.status === "needs_code") {
        router.push({
          pathname: "/(auth)/facebook-details",
          params: { step: outcome.status === "needs_code" ? "code" : "contact" },
        });
        return;
      }
      if (outcome.status === "incomplete") {
        setProblem(outcome.message);
        return;
      }
      if (outcome.status === "cancelled") {
        useSession.getState().clearSessionWait();
        setNotice(FACEBOOK_CANCELLED);
      }
      // "pending": the native return is adopting on /sso-callback.
    } catch (error) {
      useSession.getState().clearSessionWait();
      setProblem(isFacebookEmailTakenError(error) ? FACEBOOK_EMAIL_TAKEN : FACEBOOK_UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Sign in with Apple (iPhone only). Apple's sheet is native, so unlike
   * Google there is no browser return to wait for: the flow either hands back
   * a session, which is activated and joined to GRIDGO exactly as Google's is,
   * or the person closed the sheet and nothing is said.
   */
  async function continueWithApple(start: () => Promise<AppleFlowResult>) {
    startAttempt();
    try {
      if (isSignedIn) {
        // Same as Google: a live Clerk session is the person who just tapped.
        useSession.getState().beginSessionWait("in");
        await adoptAndEnter();
        return;
      }
      const result = await start();
      const outcome = appleSignInOutcome(result);
      if (outcome.status === "activated") {
        await (result.setActive ?? setActive)({ session: outcome.sessionId });
        useSession.getState().beginSessionWait("in");
        await adoptAndEnter();
        return;
      }
      if (outcome.status === "incomplete") setProblem(outcome.message);
    } catch (error) {
      if (isAppleCancel(error)) return;
      useSession.getState().clearSessionWait();
      setProblem(clerkErrorMessage(error, "Apple could not sign you in just now. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (
    sessionWait &&
    !problem &&
    identity.kind !== "mismatch" &&
    identity.kind !== "error"
  ) {
    return <SessionWait tone={sessionWait} role="supplier" />;
  }

  return (
    <View className="gg-screen">
      <FormScrollView fillHeight contentClassName="gg-page grow justify-center pb-8 pt-6">
        <GridgoLogo size={48} role="supplier" />

        {verifying ? (
          <View className="mt-8">
            <JobTicketCode
              email={email.trim()}
              value={code}
              onChange={setCode}
              onVerify={() => void verifyEmail()}
              onResend={() => void resendCode()}
              busy={busy || fetchStatus === "fetching"}
              error={problem}
            />
          </View>
        ) : (
          <>
            <View className="mt-8 gap-1">
              <Text className="text-h1 text-text-primary">Welcome Back.</Text>
              <Text className="text-body-lg text-text-secondary">Let’s sign in</Text>
              {identity.kind === "signed_out" && identity.reason === "team_removed" ? (
                <View className="gg-panel mt-4 gap-1" accessibilityRole="alert">
                  <Text className="text-button text-text-primary">{TEAM_REMOVED_TITLE}</Text>
                  <Text className="text-body text-text-secondary">{TEAM_REMOVED_DETAIL}</Text>
                  <Pressable
                    onPress={() => {
                      useTeamJoin.getState().startJoining();
                      router.push("/join-team");
                    }}
                    accessibilityRole="link"
                    className="gg-touch justify-center self-start"
                  >
                    <Text className="text-button text-brand">Have a new invite? Join</Text>
                  </Pressable>
                </View>
              ) : null}
              {identity.kind === "signed_out" && identity.reason === "session_ended" ? (
                <Text className="text-body text-text-secondary" accessibilityRole="alert">{SESSION_ENDED_MESSAGE}</Text>
              ) : null}
              {identity.kind === "signed_out" && identity.reason === "session_ended" && endedTaskNotice ? (
                <Text className="text-body text-text-secondary">{endedTaskNotice}</Text>
              ) : null}
            </View>

            <View className="mt-8 gap-4">
              <FieldShell label="Email">
                <TextField
                  value={email}
                  onChange={setEmail}
                  kind="email"
                  placeholder="you@yourshop.ph"
                  accessibilityLabel="Email"
                  returnKeyType="next"
                />
              </FieldShell>
              <FieldShell label="Password">
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  placeholder="Your password"
                  accessibilityLabel="Password"
                  returnKeyType="go"
                  onSubmit={() => void submitPassword()}
                />
              </FieldShell>
              <Pressable
                onPress={() => router.push("/(auth)/recover-password")}
                accessibilityRole="link"
                className="gg-touch justify-center self-end"
              >
                <Text className="text-button text-brand">Recover Password</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push("/(auth)/phone-sign-in")}
                accessibilityRole="link"
                className="gg-touch justify-center self-end"
              >
                <Text className="text-button text-brand">Staff: sign in with your mobile</Text>
              </Pressable>
            </View>

            {shown ? (
              <View className="mt-4">
                <ErrorNotice message={shown} />
              </View>
            ) : notice ? (
              <Text className="mt-4 text-body text-text-secondary" accessibilityRole="alert">
                {notice}
              </Text>
            ) : null}

            <View className="mt-6 gap-4">
              <PrimaryButton
                label={busy ? "Signing in…" : "Sign in"}
                disabled={busy || fetchStatus === "fetching" || !email.trim() || !password}
                onPress={() => void submitPassword()}
              />
              <AuthDivider />
              {facebookOffered ? (
                <>
                  {/* Facebook first, then Google, then Apple (report 329B287C). */}
                  <FacebookSignInButton disabled={busy} onPress={() => void continueWithFacebook()} />
                  <GoogleSignInButton disabled={busy} onPress={() => void continueWithGoogle()} />
                  <AppleSignInButton disabled={busy} onPress={(start) => void continueWithApple(start)} />
                </>
              ) : (
                <>
                  <AppleSignInButton disabled={busy} onPress={(start) => void continueWithApple(start)} />
                  <GoogleSignInButton disabled={busy} onPress={() => void continueWithGoogle()} />
                </>
              )}
            </View>

            <Pressable
              onPress={() => router.push("/(auth)/signup/start")}
              accessibilityRole="link"
              className="gg-touch mt-5 items-center justify-center"
            >
              <Text className="text-button text-brand">New shop? Sign up</Text>
            </Pressable>
          </>
        )}
      </FormScrollView>

      {healthState === "unreachable" ? (
        <View className="gg-page pb-8">
          <Text className="text-caption text-text-muted">{gridgoUnreachableMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}
