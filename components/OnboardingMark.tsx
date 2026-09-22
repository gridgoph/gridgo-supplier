import { Image } from "expo-image";
import { View } from "react-native";

import { images } from "@/constants/images";
import type { OnboardingArt } from "@/data/onboarding";

/**
 * The onboarding picture: large, but inset so it does not kiss the screen
 * edges. `px-6` is 24px a side — enough air without shrinking it to a stamp.
 */
export function OnboardingMark({ name }: { name: OnboardingArt }) {
  return (
    <View className="min-h-0 w-full flex-1 px-6" aria-hidden>
      <Image
        source={images.onboarding[name]}
        style={{ width: "100%", height: "100%" }}
        contentFit="contain"
      />
    </View>
  );
}
