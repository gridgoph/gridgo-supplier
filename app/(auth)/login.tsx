import { useAuth, useClerk, useSignIn, useUser } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AuthDivider } from "@/components/AuthDivider";
import { ErrorNotice } from "@/components/ErrorNotice";
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
import { completeGoogleSso } from "@/lib/googleSso";
import { useSession } from "@/store/session";

type HealthState = "checking" | "reachable" | "unreachable";

export default function LoginScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const { isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const { setActive, signOut } = useClerk();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [healthState, setHealthState] = useState<HealthState>("checking");
  const sessionWait = useSession((state) => state.sessionWait);
  const identity = useSession((state) => state.identity);

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

  async function refuseNonSupplier() {
    setVerifying(false);
    setProblem(emailUnavailableMessage);
    useSession.getState().clearSessionWait();
    await releaseClerkSession(() => signOut());
    useSession.getState().clearClerkIdentity();
  }

  async function adoptAndEnter() {
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
      prepareApplyDraft(clerkUser?.primaryEmailAddress?.emailAddress);
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
      if (door === "wrong_app") {
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
    setBusy(true);
    setProblem(null);
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
    setBusy(true);
    setProblem(null);
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
            </View>

            {problem ? (
              <View className="mt-4">
                <ErrorNotice message={problem} />
              </View>
            ) : null}

            <View className="mt-6 gap-4">
              <PrimaryButton
                label={busy ? "Signing in…" : "Sign in"}
                disabled={busy || fetchStatus === "fetching" || !email.trim() || !password}
                onPress={() => void submitPassword()}
              />
              <AuthDivider />
              <GoogleSignInButton disabled={busy} onPress={() => void continueWithGoogle()} />
            </View>

            <Pressable
              onPress={() => router.push("/(auth)/signup")}
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
