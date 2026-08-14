import { Image } from "expo-image";
import { router } from "expo-router";
import { Text, View } from "react-native";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";

export default function WelcomeScreen() {
  return (
    <View className="gg-screen gg-page justify-between pb-8 pt-16">
      <GridgoLogo size={48} role="supplier" />

      <View className="flex-1 justify-center py-8">
        <Image
          source={require("@/assets/illustrations/storefront-welcome.svg")}
          contentFit="contain"
          style={{ width: "100%", aspectRatio: 1.35 }}
          accessibilityLabel="A print shop opening for the day"
        />
        <View className="mt-6 gap-2">
          <Text className="text-display text-text-primary">Open the shop with GRIDGO</Text>
          <Text className="text-body-lg text-text-secondary">
            Accept work, keep production moving, and follow every payout from one supplier floor.
          </Text>
        </View>
      </View>

      <View className="gap-3">
        <PrimaryButton
          label="Accept an invitation"
          onPress={() => router.push("/(auth)/accept-invitation")}
        />
        <SecondaryButton
          label="Already have an account"
          onPress={() => router.push("/(auth)/login")}
        />
      </View>
    </View>
  );
}
