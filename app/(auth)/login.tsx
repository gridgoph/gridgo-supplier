import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Redirect, router } from "expo-router";

import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PushEnableCard } from "@/components/PushEnableCard";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { FieldShell } from "@/components/controls/FieldShell";
import { PasswordField } from "@/components/controls/PasswordField";
import { TextField } from "@/components/controls/TextField";
import { getApiBase, health } from "@/lib/api";
import { isSignedIn, useSession } from "@/store/session";

import { DEV_LOGIN } from "@/lib/devLogin";

type HealthState = "checking" | "reachable" | "unreachable";

/**
 * The development-only connection line.
 *
 * Written as a whole component behind `__DEV__` at module scope, not as a
 * branch inside the screen. A branch that merely never renders still ships
 * every literal inside it — `GRIDGO on`, the host, `Answering`, `No answer` —
 * and this screen is on a public address. `__DEV__` is substituted by Metro at
 * bundle time, so a production build folds this to `null` and the minifier
 * drops the function and its strings entirely. Exactly the argument
 * `lib/devLogin.ts` makes about credentials, for exactly the same reason.
 */
const DevConnectionLine: ((props: { health: HealthState }) => React.ReactElement) | null = __DEV__
  ? ({ health }) => (
      <View className="gg-page flex-row items-center gap-3 pb-8">
        <Text
          className="min-w-0 flex-1 text-caption text-text-muted"
          numberOfLines={1}
          accessibilityLabel={`GRIDGO on this network at ${hostOf(getApiBase())}`}
        >
          GRIDGO on {hostOf(getApiBase())}
        </Text>
        {health === "checking" ? (
          <StatusChip tone="neutral" label="Checking" icon="clock" />
        ) : health === "reachable" ? (
          <StatusChip tone="success" label="Answering" icon="circle-check" />
        ) : (
          <StatusChip tone="error" label="No answer" icon="circle-x" />
        )}
      </View>
    )
  : null;

/**
 * The door.
 *
 * Only shops sign in here — client, rider and Operations accounts have their
 * own apps, and the error says which one rather than naming a platform role.
 * A shop that has no account opens one itself now; Operations used to create
 * every account, and the copy that said so was the last thing in this app still
 * claiming it.
 *
 * **The connection line at the foot is two different things behind the same
 * `__DEV__` guard as the credential prefill.** On a development build it names
 * the host and reports Checking / Answering / No answer, which is the
 * difference between a wrong password and a laptop that went to sleep — the
 * captain reads it dozens of times a day. On a release build it names no
 * infrastructure at all and stays silent while GRIDGO answers: a print shop
 * owner cannot act on a hostname, and a red "No answer" beside one reads as the
 * app being broken. What is left is one plain sentence, shown only when there
 * is genuinely a problem the shop can act on.
 *
 * The guard is compile-time on purpose, exactly as `lib/devLogin.ts` explains:
 * Metro substitutes `__DEV__` at bundle time, so the host string is dropped
 * from a production bundle rather than merely hidden by a runtime branch.
 * `scripts/assert-no-dev-credentials.mjs` asserts the emitted export.
 *
 * Credentials start empty on a release build for the same reason. In a
 * development build only, `DEV_LOGIN` prefills the pilot supplier so the captain
 * can sign in with one tap; Metro strips that branch from production, proved by
 * the disclosure tests and the production-export assertion.
 */
export default function LoginScreen() {
  const { user, login, loading, error } = useSession();
  const [email, setEmail] = useState(() => DEV_LOGIN?.email ?? "");
  const [password, setPassword] = useState(() => DEV_LOGIN?.password ?? "");
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
            <PasswordField
              value={password}
              onChange={setPassword}
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

        {/*
          The door asks too, and it is the only surface that can. A shop that
          installs GRIDGO and does not sign in for a week never reaches a screen
          behind the guard, and on Android 13+ the permission can only be asked
          while the app is open — so a door that never asks is a phone GRIDGO
          can never tell to update. It draws only the ask, never a failure or a
          settings link (see `pushOffer`), and its copy promises only what an
          unclaimed phone actually receives.
        */}
        <PushEnableCard spacing="above" />
      </FormScrollView>

      {/*
        Not an action, so it is allowed to sit under the keyboard: it answers
        "is the server there?" before anyone types, which is when it is read.
      */}
      {DevConnectionLine ? (
        <DevConnectionLine health={healthState} />
      ) : healthState === "unreachable" ? (
        // A release build says this and only this, and only when it is true.
        // While GRIDGO answers there is nothing here — a chip that reads
        // "Answering" tells a shop owner something they never asked, and a
        // hostname beside it tells them something they cannot use.
        <View className="gg-page pb-8">
          <Text className="text-caption text-text-muted">
            Can’t reach GRIDGO right now. Check this phone’s connection, then try again.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Host and port only — the scheme adds nothing on a phone screen. */
function hostOf(base: string): string {
  return base.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
