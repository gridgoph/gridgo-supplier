import { Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { MissionMap } from "@/components/signup/MissionMap";
import { spacing } from "@/constants/theme";
import {
  currentMission,
  isHomeSignup,
  ownerClaimLink,
  ownerClaimMessage,
  setupComplete,
  type MissionId,
} from "@/lib/guidedSignup";
import { joinTeamLink } from "@/lib/shopTeam";
import { useGuidedSignup } from "@/store/guidedSignup";
import { useHomePrinter } from "@/store/homePrinter";
import { isShopOwner, isVerifiedShop, useSession, verifyLater } from "@/store/session";

/**
 * The same "Set up your shop" map, once the shop exists (gridgo-supplier#265).
 *
 * Every stop opens a screen the shop already has — hours, team, payouts,
 * verification — so nothing here is a second copy of them. Coming back from
 * one reads GRIDGO again, and the stop turns done because GRIDGO says so.
 *
 * Two things happen by themselves: GRIDGO's sample photo goes onto each new
 * document listing (`lib/signupAfterEnroll.ts`), and a manager's last stop
 * waits for the owner, with a link to send them.
 */
export default function SetupScreen() {
  const insets = useSafeAreaInsets();
  const user = useSession((s) => s.user);
  const signup = useGuidedSignup((s) => s.signup);
  const owner = isShopOwner(user);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const next = currentMission(signup);
  const complete = setupComplete(signup);
  const waitingForOwner = signup?.nextStep === "owner_claim";
  // A home printer's setup ends at Starter, which comes before any job.
  const home = isHomeSignup(signup);
  const homeStarter = useHomePrinter((s) => (s.home ? s.home.status.level !== "pending" : false));

  useFocusEffect(
    useCallback(() => {
      void useGuidedSignup.getState().loadShop();
      void useHomePrinter.getState().load();
    }, []),
  );

  function open(id: MissionId) {
    switch (id) {
      case "hours":
        router.push({ pathname: "/shop-hours", params: { setup: "1" } });
        return;
      case "staff":
        router.push("/team");
        return;
      case "paid":
        if (owner) router.push({ pathname: "/payout-account", params: { setup: "1" } });
        return;
      case "prints":
        router.push("/(tabs)/catalogues");
        return;
      case "verify":
        router.push(home || verifyLater(user) ? "/verify" : "/accreditation");
        return;
      default:
        return;
    }
  }

  async function shareOwnerLink() {
    setOwnerError(null);
    setSharing(true);
    const link = await ownerClaimLink();
    setSharing(false);
    if (link.status === "failed") {
      setOwnerError(link.message);
      return;
    }
    await Share.share({ message: ownerClaimMessage(joinTeamLink(link.token)) });
  }

  return (
    <View className="gg-screen">
      {home ? <Stack.Screen options={{ title: "Get set up" }} /> : null}
      <FormScrollView contentClassName="gg-page gap-6 pb-8 pt-4">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">
            {home
              ? complete
                ? "You're set up"
                : "Start printing from home in 5 minutes"
              : complete
                ? "Your shop is set up"
                : "Set up your shop in 5 minutes"}
          </Text>
          <Text className="text-body-lg text-text-secondary">
            {home
              ? complete
                ? "Last step: Starter. Then you can go online."
                : "Your account is open. A few more taps, then Starter."
              : complete
                ? "Everything GRIDGO needs is saved."
                : waitingForOwner
                  ? "Your part is done. Your owner sets where GRIDGO pays."
                  : "Your shop is open. A few more taps and it can take jobs."}
          </Text>
        </View>

        <MissionMap signup={signup} onOpen={open} verified={home ? homeStarter : isVerifiedShop(user)} />

        {waitingForOwner ? (
          <View className="gg-card gap-3" testID="owner-claim">
            <Text className="text-body font-medium text-text-primary">Ask your owner to claim the shop</Text>
            <Text className="text-body text-text-secondary">
              Send them this link. They sign in with their own mobile and set where GRIDGO pays. Payouts wait
              until they do; jobs do not.
            </Text>
            {ownerError ? <ErrorNotice message={ownerError} /> : null}
            <SecondaryButton
              label={sharing ? "Making the link…" : "Send the claim link"}
              disabled={sharing}
              onPress={() => void shareOwnerLink()}
            />
          </View>
        ) : null}
      </FormScrollView>

      <View className="gg-page bg-canvas pt-4" style={{ paddingBottom: insets.bottom + spacing.lg }}>
        {home && complete ? (
          <PrimaryButton
            label="Continue: Get to Starter"
            hint="Padayon"
            onPress={() => router.push("/verify")}
          />
        ) : complete || (waitingForOwner && !next) ? (
          <PrimaryButton label="Finish" hint="Human na" onPress={() => router.replace("/setup-ready")} />
        ) : next && (next.id !== "paid" || owner) ? (
          <PrimaryButton label={`Continue: ${next.title}`} hint="Padayon" onPress={() => open(next.id)} />
        ) : null}
      </View>
    </View>
  );
}
