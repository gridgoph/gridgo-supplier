import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Redirect } from "expo-router";

import { GridgoLogo } from "@/components/GridgoLogo";
import { StatusChip } from "@/components/StatusChip";
import { getApiBase, health } from "@/lib/api";
import { isSignedIn, useSession } from "@/store/session";

type HealthState = "checking" | "reachable" | "unreachable";

export default function LoginScreen() {
  const { user, login, loading, error } = useSession();
  const [email, setEmail] = useState("supplier@gridgo.local");
  const [password, setPassword] = useState("demo");
  const [apiBase] = useState(() => getApiBase());
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
    <View className="flex-1 bg-canvas px-6">
      <View className="flex-1 justify-center">
        <GridgoLogo role="supplier" />
        <Text className="mt-6 font-satoshi-bold text-2xl text-text-primary">Supplier sign in</Text>
        <Text className="mt-1 font-satoshi text-text-secondary">Demo API · supplier role</Text>

        <TextInput
          className="mt-6 rounded-xl border border-outline bg-surface px-4 py-3 font-satoshi text-text-primary"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
        />
        <TextInput
          className="mt-3 rounded-xl border border-outline bg-surface px-4 py-3 font-satoshi text-text-primary"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
        />
        {error ? <Text className="mt-3 font-satoshi text-error">{error}</Text> : null}
        <Pressable
          className="mt-5 items-center rounded-xl bg-action-yellow py-3.5"
          disabled={loading}
          onPress={() => void login(email.trim(), password)}
        >
          <Text className="font-satoshi-medium text-action-yellow-on">
            {loading ? "Signing in…" : "Sign in"}
          </Text>
        </Pressable>
        <Text className="mt-4 font-satoshi text-sm text-text-muted">supplier@gridgo.local / demo</Text>
      </View>

      <View className="mb-8 flex-row items-center gap-2">
        <Text
          className="min-w-0 flex-1 font-satoshi text-caption text-text-muted"
          numberOfLines={2}
          accessibilityLabel={`API base ${apiBase}`}
        >
          {apiBase}
        </Text>
        {healthState === "checking" ? (
          <StatusChip tone="neutral" label="Checking…" icon="clock" />
        ) : healthState === "reachable" ? (
          <StatusChip tone="success" label="Reachable" icon="circle-check" />
        ) : (
          <StatusChip tone="error" label="Unreachable" icon="circle-x" />
        )}
      </View>
    </View>
  );
}
