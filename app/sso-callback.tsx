import { router } from "expo-router";
import { useEffect } from "react";
import { Text, View } from "react-native";

/** Matches Clerk's default Expo AuthSession redirect while SSO finishes. */
export default function SsoCallbackScreen() {
  useEffect(() => {
    router.replace("/");
  }, []);

  return (
    <View className="gg-screen gg-page items-center justify-center">
      <Text className="text-body text-text-secondary">Signing you in…</Text>
    </View>
  );
}
