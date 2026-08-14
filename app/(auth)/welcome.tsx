import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";

export default function WelcomeScreen() {
  return (
    <View className="gg-screen gg-page justify-between pb-8 pt-16">
      <GridgoLogo size={48} role="supplier" />

      <View className="flex-1 justify-center py-8">
        <Image
          source={require("@/assets/illustrations/welcome.svg")}
          contentFit="contain"
          style={{ width: "100%", aspectRatio: 1.18 }}
          accessibilityLabel="A shop owner waving from the counter, ready to open"
        />
        <View className="mt-6 gap-2">
          <Text className="text-display text-text-primary">Open the shop with GRIDGO</Text>
          <Text className="text-body-lg text-text-secondary">
            Apply your print shop. Operations reviews the account before any job is matched — then
            you accept work, keep production moving, and follow every payout from one floor.
          </Text>
        </View>
      </View>

      <View className="gap-3">
        <PrimaryButton label="Sign up" onPress={() => router.push("/(auth)/signup")} />
        <SecondaryButton
          label="Already have an account"
          onPress={() => router.push("/(auth)/login")}
        />
        <Pressable
          onPress={() => router.push("/(auth)/accept-invitation")}
          accessibilityRole="link"
          className="gg-touch items-center justify-center"
        >
          <Text className="text-button text-brand">Have an invitation? Open it</Text>
        </Pressable>
      </View>
    </View>
  );
}
