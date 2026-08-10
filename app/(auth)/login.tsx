import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Redirect, router } from "expo-router";

import { ErrorNotice } from "@/components/ErrorNotice";
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
 * between a wrong password and a laptop that went to sleep.
 */
export default function LoginScreen() {
  const { user, login, loading, error } = useSession();
  const [email, setEmail] = useState("supplier@gridgo.local");
  const [password, setPassword] = useState("demo");
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      // Only iOS needs this: Android resizes the window for the keyboard itself
      // (`adjustResize` under edge-to-edge), and padding on top of that would
      // push the fields twice as far. Same behaviour, one platform's work.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="gg-screen">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gg-page grow justify-center pb-8 pt-16"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <GridgoLogo size={48} role="supplier" />

          <View className="mt-8 gap-2">
            <Text className="text-h1 text-text-primary">Sign in</Text>
            <Text className="text-body-lg text-text-secondary">
              The shop side of GRIDGO — job offers, production, and payout for print
              manufacturers in Davao.
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
        </ScrollView>

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
    </KeyboardAvoidingView>
  );
}

/** Host and port only — the scheme adds nothing on a phone screen. */
function hostOf(base: string): string {
  return base.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
