import { useAuth, useClerk, useSignIn } from "@clerk/expo";
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
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { FieldShell } from "@/components/controls/FieldShell";
import { PasswordField } from "@/components/controls/PasswordField";
import { TextField } from "@/components/controls/TextField";
import { enterAfterClerkSession, hrefAfterClerkAuth } from "@/lib/afterClerkAuth";
import { getApiBase, health } from "@/lib/api";
import { clerkErrorMessage, type ClerkGetToken } from "@/lib/clerk";
import { continuationAfterSignIn } from "@/lib/clerkSignIn";
import { DEV_LOGIN } from "@/lib/devLogin";
import { completeGoogleSso } from "@/lib/googleSso";
import { useSession } from "@/store/session";

type HealthState = "checking" | "reachable" | "unreachable";

const DevConnectionLine: ((props: { health: HealthState }) => React.ReactElement) | null = __DEV__
  ? ({ health: state }) => (
      <View className="gg-page flex-row items-center gap-3 pb-8">
        <Text
          className="min-w-0 flex-1 text-caption text-text-muted"
          numberOfLines={1}
          accessibilityLabel={`GRIDGO on this network at ${hostOf(getApiBase())}`}
        >
          GRIDGO on {hostOf(getApiBase())}
        </Text>
        {state === "checking" ? (
          <StatusChip tone="neutral" label="Checking" icon="clock" />
        ) : state === "reachable" ? (
          <StatusChip tone="success" label="Answering" icon="circle-check" />
        ) : (
          <StatusChip tone="error" label="No answer" icon="circle-x" />
        )}
      </View>
    )
  : null;

/** The replaceable local demo stays useful, but Metro removes it from release builds. */
const DevDemoLogin: (() => React.ReactElement) | null = __DEV__
  ? () => {
      const login = useSession((state) => state.login);
      const loading = useSession((state) => state.loading);
      return (
        <SecondaryButton
          label="Use local supplier demo"
          disabled={loading || !DEV_LOGIN}
          onPress={() => {
            if (DEV_LOGIN) void login(DEV_LOGIN.email, DEV_LOGIN.password);
          }}
        />
      );
    }
  : null;

export default function LoginScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const { isSignedIn, getToken } = useAuth();
  const { setActive } = useClerk();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [healthState, setHealthState] = useState<HealthState>("checking");

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

  async function adoptAndEnter() {
    const next = await enterAfterClerkSession(getToken as ClerkGetToken);
    if (next.kind === "blocked") {
      setProblem(next.message);
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
      const attempt = await signIn.password({
        identifier: email.trim(),
        password,
      });
      if (attempt.error) {
        setProblem(clerkErrorMessage(attempt.error, "Check the email and password, then try again."));
        return;
      }
      const next = await continueSignIn();
      if (next === "ready") await adoptAndEnter();
    } catch (error) {
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
        return;
      }
      if (outcome.status === "activated" || outcome.status === "already_signed_in") {
        await adoptAndEnter();
        return;
      }
      setProblem("Google did not finish signing in. Try again.");
    } catch (error) {
      setProblem(clerkErrorMessage(error, "Google could not sign you in just now. Try again."));
    } finally {
      setBusy(false);
    }
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
              {DevDemoLogin ? <DevDemoLogin /> : null}
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

      {DevConnectionLine ? (
        <DevConnectionLine health={healthState} />
      ) : healthState === "unreachable" ? (
        <View className="gg-page pb-8">
          <Text className="text-caption text-text-muted">
            Can’t reach GRIDGO right now. Check this phone’s connection, then try again.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function hostOf(base: string): string {
  return base.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
