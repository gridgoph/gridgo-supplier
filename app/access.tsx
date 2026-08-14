import { Text, View } from "react-native";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useSession } from "@/store/session";

export default function AccessScreen() {
  const identity = useSession((state) => state.identity);
  const logout = useSession((state) => state.logout);

  const message =
    identity.kind === "mismatch"
      ? `This account belongs in ${identity.destination}. Supplier work stays closed here.`
      : identity.kind === "error"
        ? identity.message
        : "GRIDGO supplier access has not been assigned. Ask Operations to invite this email.";
  const email = "email" in identity ? identity.email : null;

  return (
    <View className="gg-screen gg-page justify-center py-16">
      <GridgoLogo size={48} role="supplier" />
      <View className="mt-10 gap-3">
        <Text className="text-h1 text-text-primary">This shop is still closed</Text>
        <Text className="text-body-lg text-text-secondary">{message}</Text>
        {email ? <Text className="text-body text-text-muted">Signed in as {email}</Text> : null}
      </View>
      <View className="mt-8">
        <PrimaryButton label="Sign out" onPress={() => void logout()} />
      </View>
    </View>
  );
}
