import { Clock } from "lucide-react-native";
import { useEffect } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GridgoLogo } from "@/components/GridgoLogo";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { askConfirm } from "@/store/sheets";
import { useSession } from "@/store/session";

/** How often to ask whether the Owner has answered, while this screen is up. */
export const TEAM_WAIT_POLL_MS = 10_000;

/**
 * Joined a shop's team; the Owner has not approved yet.
 *
 * Nothing to do but wait, so the screen says one thing and checks for the
 * answer by itself — on a timer, on return to the app, and on a tap. Approval
 * opens the shop's jobs without a sign-in; a decline says so on the next check.
 */
export default function TeamWaitingScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const identity = useSession((s) => s.identity);
  const recheck = useSession((s) => s.recheckTeam);
  const logout = useSession((s) => s.logout);
  const shopName = identity.kind === "team_pending" ? identity.shopName : "the shop";

  useEffect(() => {
    const timer = setInterval(() => void recheck(), TEAM_WAIT_POLL_MS);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void recheck();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [recheck]);

  async function signOut() {
    const confirmed = await askConfirm({
      question: "Sign out while you wait?",
      consequence: "Your request stays with the owner. Sign in again to see their answer.",
      confirmLabel: "Sign out",
      cancelLabel: "Keep waiting",
    });
    if (confirmed) void logout();
  }

  return (
    <View
      className="gg-screen gg-page justify-between"
      style={{ paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 12) + 12 }}
    >
      <GridgoLogo size={40} role="supplier" />

      <View className="items-center gap-4">
        <View className="h-20 w-20 items-center justify-center rounded-pill border border-outline bg-surface">
          <Clock size={36} color={colors.textPrimary} aria-hidden />
        </View>
        <Text className="text-center text-h2 text-text-primary" accessibilityRole="header">
          Waiting for the owner
        </Text>
        <Text className="text-center text-body-lg text-text-secondary">
          {`${shopName} will approve you. This opens by itself.`}
        </Text>
      </View>

      <View className="gap-3">
        <SecondaryButton label="Check now" onPress={() => void recheck()} />
        <Pressable
          onPress={() => void signOut()}
          accessibilityRole="button"
          className="gg-touch items-center justify-center"
        >
          <Text className="text-button text-text-muted">Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}
