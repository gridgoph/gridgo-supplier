import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Redirect } from "expo-router";

import { GridgoLogo } from "@/components/GridgoLogo";
import { getApiBase } from "@/lib/api";
import { useSession } from "@/store/session";

export default function LoginScreen() {
  const { user, login, loading, error } = useSession();
  const [email, setEmail] = useState("supplier@gridgo.local");
  const [password, setPassword] = useState("demo");

  if (user) return <Redirect href="/(tabs)/home" />;

  return (
    <View className="flex-1 justify-center bg-canvas px-6">
      <GridgoLogo />
      <Text className="mt-6 font-satoshi-bold text-2xl text-text-primary">Supplier sign in</Text>
      <Text className="mt-1 font-satoshi text-text-secondary">Demo API · {getApiBase()}</Text>

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
        <Text className="font-satoshi-medium text-action-yellow-on">{loading ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
      <Text className="mt-4 font-satoshi text-sm text-text-muted">supplier@gridgo.local / demo</Text>
    </View>
  );
}
