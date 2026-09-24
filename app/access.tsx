import { Text, View } from "react-native";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useSession } from "@/store/session";

export default function AccessScreen() {
  const identity = useSession((state) => state.identity);
  const logout = useSession((state) => state.logout);

  const title = identity.kind === "mismatch"
    ? "This account belongs to a different GRIDGO app"
    : identity.kind === "error" && identity.reason === "access_withdrawn"
      ? "Supplier access was withdrawn"
      : "We could not open this supplier account";

  const message =
    identity.kind === "mismatch"
      ? `Open ${identity.destination} to use this account, or sign out and use your shop’s account here.`
      : identity.kind === "error"
        ? identity.message
        : "GRIDGO supplier access has not been assigned. Sign out and apply as a shop, or ask Operations if you already have an invitation.";
  const email = "email" in identity ? identity.email : null;

  return (
    <View className="gg-screen gg-page justify-center py-16">
      <GridgoLogo size={48} role="supplier" />
      <View className="mt-10 gap-3">
        <Text className="text-h1 text-text-primary">{title}</Text>
        <Text className="text-body-lg text-text-secondary">{message}</Text>
        {email ? <Text className="text-body text-text-muted">Signed in as {email}</Text> : null}
      </View>
      <View className="mt-8">
        <PrimaryButton label="Sign out" onPress={() => void logout()} />
      </View>
    </View>
  );
}
