import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { TEAM_REMOVED_TITLE, useSession } from "@/store/session";
import { useTeamJoin } from "@/store/teamJoin";

export default function AccessScreen() {
  const identity = useSession((state) => state.identity);
  const logout = useSession((state) => state.logout);
  const removed = identity.kind === "error" && identity.reason === "team_removed";

  const title = removed
    ? TEAM_REMOVED_TITLE
    : identity.kind === "mismatch"
      ? "This account belongs to a different GRIDGO app"
      : identity.kind === "error" && identity.reason === "access_withdrawn"
        ? "Supplier access was withdrawn"
        : "We could not open this supplier account";

  const message = removed
    ? "The owner removed you from the shop. Ask them for a new invite to join again."
    : identity.kind === "mismatch"
      ? `Open ${identity.destination} to use this account, join a shop's team with it, or sign out and use your shop’s account here.`
      : identity.kind === "error"
        ? identity.message
        : "GRIDGO supplier access has not been assigned. Sign out and apply as a shop, or ask Operations if you already have an invitation.";
  const email = "email" in identity ? identity.email : null;
  // A removed teammate, or a client/rider login, may join a team with an invite.
  const canJoin = removed || identity.kind === "mismatch";

  function joinTeam() {
    useTeamJoin.getState().startJoining();
    router.push("/join-team");
  }

  return (
    <View className="gg-screen gg-page justify-center py-16">
      <GridgoLogo size={48} role="supplier" />
      <View className="mt-10 gap-3">
        <Text className="text-h1 text-text-primary">{title}</Text>
        <Text className="text-body-lg text-text-secondary">{message}</Text>
        {email ? <Text className="text-body text-text-muted">Signed in as {email}</Text> : null}
      </View>
      <View className="mt-8 gap-3">
        {canJoin ? (
          <>
            <PrimaryButton label="Join a team" onPress={joinTeam} />
            <SecondaryButton label="Sign out" onPress={() => void logout()} />
          </>
        ) : (
          <PrimaryButton label="Sign out" onPress={() => void logout()} />
        )}
      </View>
      {canJoin ? null : (
        <Pressable onPress={joinTeam} accessibilityRole="link" className="gg-touch mt-2 items-center justify-center">
          <Text className="text-button text-brand">Have a team invite? Join</Text>
        </Pressable>
      )}
    </View>
  );
}
