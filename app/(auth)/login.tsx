import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Redirect, router } from "expo-router";

import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { FieldShell } from "@/components/controls/FieldShell";
import { TextField } from "@/components/controls/TextField";
import { getApiBase, health } from "@/lib/api";
import { isSignedIn, useSession } from "@/store/session";

type HealthState = "checking" | "reachable" | "unreachable";

/**
 * The door.
 *
 * Only shops sign in here — client, rider and Operations accounts have their
 * own apps, and the error says which one rather than naming a platform role.
 * A shop that has no account opens one itself now; Operations used to create
 * every account, and the copy that said so was the last thing in this app still
 * claiming it.
 *
 * The connection line at the foot is for the person holding the phone: on a
 * demo build, "GRIDGO is not answering on this network" is the difference
 * between a wrong password and a laptop that went to sleep. It names the host
 * and nothing else — this screen is on a public address now, so anything it
 * shows, it shows to whoever opens the app.
 *
 * Both fields start empty for the same reason. They used to arrive carrying the
 * pilot account and its password, which was a convenience on a laptop and a way
 * in on a hosted build; the passwords themselves now come from deployment
 * configuration rather than this repository, so a typed-in hint would be stale
 * as well as unsafe.
 */
export default function LoginScreen() {
  const { user, login, loading, error } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiHost] = useState(() => hostOf(getApiBase()));
  const [healthState, setHealthState] = useState<HealthState>("checking");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await health();
        if (!cancelled) setHealthState("reachable");
      } catch {
        if (!cancelled) setHealthState("unreachable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isSignedIn(user)) return <Redirect href="/(tabs)/home" />;

  return (
    <View className="gg-screen">
      <FormScrollView fillHeight contentClassName="gg-page grow justify-center pb-8 pt-16">
        <GridgoLogo size={48} role="supplier" />

        <View className="mt-8 gap-2">
          <Text className="text-h1 text-text-primary">Sign in</Text>
          <Text className="text-body-lg text-text-secondary">
            The shop side of GRIDGO — job offers, production, and payout for print manufacturers
            in Davao.
          </Text>
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
            <TextField
              value={password}
              onChange={setPassword}
              kind="password"
              placeholder="Your password"
              accessibilityLabel="Password"
              returnKeyType="go"
              onSubmit={() => void login(email.trim(), password)}
            />
          </FieldShell>
        </View>

        {error ? (
          <View className="mt-4">
            <ErrorNotice message={error} />
          </View>
        ) : null}

        <View className="mt-6 gap-3">
          <PrimaryButton
            label={loading ? "Signing in…" : "Sign in"}
            disabled={loading}
            onPress={() => void login(email.trim(), password)}
          />
          <SecondaryButton
            label="Open a shop account"
            disabled={loading}
            onPress={() => router.push("/(auth)/signup")}
          />
        </View>

        <Text className="mt-4 text-caption text-text-muted">
          Opening an account takes a few minutes. GRIDGO will not match work to your shop until
          Operations has checked it.
        </Text>
      </FormScrollView>

      {/*
        Not an action, so it is allowed to sit under the keyboard: it answers
        "is the server there?" before anyone types, which is when it is read.
      */}
      <View className="gg-page flex-row items-center gap-3 pb-8">
        <Text
          className="min-w-0 flex-1 text-caption text-text-muted"
          numberOfLines={1}
          accessibilityLabel={`GRIDGO on this network at ${apiHost}`}
        >
          GRIDGO on {apiHost}
        </Text>
        {healthState === "checking" ? (
          <StatusChip tone="neutral" label="Checking" icon="clock" />
        ) : healthState === "reachable" ? (
          <StatusChip tone="success" label="Answering" icon="circle-check" />
        ) : (
          <StatusChip tone="error" label="No answer" icon="circle-x" />
        )}
      </View>
    </View>
  );
}

/** Host and port only — the scheme adds nothing on a phone screen. */
function hostOf(base: string): string {
  return base.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
