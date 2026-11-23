import { useAuth } from "@clerk/expo";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { MissionMap } from "@/components/signup/MissionMap";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing } from "@/constants/theme";
import * as api from "@/lib/api";
import { awaitClerkSessionToken } from "@/lib/clerk";
import { currentMission, type MissionId } from "@/lib/guidedSignup";
import { useGuidedSignup } from "@/store/guidedSignup";

/** Before the shop exists, the missions that open a screen in this stack. */
const ROUTES = {
  shop: "/(auth)/signup/your-shop",
  pin: "/(auth)/signup/pin",
  prints: "/(auth)/signup/prints",
  staff: "/(auth)/signup/open-shop",
} as const;

/**
 * "Set up your shop in 5 minutes" before the shop exists (gridgo-supplier#265).
 *
 * Read again every time it comes back into view, so what it shows is what
 * GRIDGO saved — and reopening the app lands here with the right stop lit.
 * Hours and payouts are the shop's own screens, so they open once the shop
 * does (the same map continues at `/setup`).
 */
export default function SignupMissionsScreen() {
  const insets = useSafeAreaInsets();
  const signup = useGuidedSignup((s) => s.signup);
  const error = useGuidedSignup((s) => s.error);
  const next = currentMission(signup);
  const { getToken } = useAuth();

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        // A cold start lands here before Clerk has a token to read with.
        api.setTokenProvider(getToken);
        await awaitClerkSessionToken(getToken);
        await useGuidedSignup.getState().load();
      })();
    }, [getToken]),
  );

  function open(id: MissionId) {
    if (id in ROUTES) router.push(ROUTES[id as keyof typeof ROUTES]);
  }

  return (
    <View className="gg-screen">
      <FormScrollView contentClassName="gg-page gap-6 pb-8 pt-4">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">Set up your shop in 5 minutes</Text>
          <Text className="text-body-lg text-text-secondary">
            Six short steps. Finish them and your shop can take jobs today.
          </Text>
        </View>
        {error ? <ErrorNotice message={error} onRetry={() => void useGuidedSignup.getState().load()} /> : null}
        <MissionMap signup={signup} onOpen={open} verifyOpen={false} />
      </FormScrollView>
      {next && next.id in ROUTES ? (
        <View className="gg-page bg-canvas pt-4" style={{ paddingBottom: insets.bottom + spacing.lg }}>
          <PrimaryButton
            label={`Continue: ${next.title}`}
            hint="Padayon"
            onPress={() => open(next.id)}
            testID="missions-continue"
          />
        </View>
      ) : null}
    </View>
  );
}
