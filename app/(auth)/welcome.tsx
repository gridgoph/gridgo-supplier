import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";

/** Source pixels of `welcome.webp` — width / height. */
const ART_RATIO = 1100 / 1055;

/**
 * The door.
 *
 * The floor is the product — press, desk, proofs, the owner reading a sheet.
 * It sits as a hero, not a stamp, and not a full-bleed poster. Copy under it
 * names what the shop can do, not how GRIDGO reviews an application.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const artWidth = Math.round(Math.min(width * 0.78, height * 0.34 * ART_RATIO));
  const artHeight = Math.round(artWidth / ART_RATIO);

  return (
    <View
      className="gg-screen gg-page justify-between"
      style={{
        paddingTop: Math.max(insets.top, 12) + 8,
        paddingBottom: Math.max(insets.bottom, 12) + 12,
      }}
    >
      <GridgoLogo size={48} role="supplier" />

      <View className="flex-1 items-center justify-center">
        <Image
          source={require("@/assets/illustrations/welcome.webp")}
          contentFit="contain"
          style={{ width: artWidth, height: artHeight }}
          accessibilityLabel="A print shop floor: press running, proofs stacked, the owner checking a sheet"
        />
      </View>

      <View className="mb-5 mt-1 gap-2 pr-10">
        <Text className="text-display text-text-primary">Open the shop with GRIDGO</Text>
        <Text className="text-body-lg text-text-secondary">
          Take the job. Run production. Get paid from one floor.
        </Text>
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
