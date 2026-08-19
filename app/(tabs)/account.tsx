import { useUser } from "@clerk/expo";
import { ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";

import { ScreenHeader } from "@/components/ScreenHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { clerkDisplayName } from "@/lib/clerk";
import { useThemeColors } from "@/hooks/useTheme";
import { askConfirm } from "@/store/sheets";
import { isMatchable, useSession } from "@/store/session";

/**
 * The shop's own account.
 *
 * Deliberately short. A screen that lists every setting at once is a screen
 * people scan instead of read, and almost nothing here is looked at twice a
 * year — so it leads with the two facts that change what the shop can do today
 * (who GRIDGO thinks it is, and that GRIDGO will match work to it) and puts
 * everything routine one clear tap away, grouped by what it is about.
 *
 * Recognition over recall: every destination says what is behind it in a line,
 * so a shop chooses from what it can see rather than remembering where a
 * setting lives. And the one action that undoes the session asks first — a
 * counter phone gets handed around, and signing out by accident on a Saturday
 * means finding a password on a Saturday.
 */
export default function AccountScreen() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const { user: clerkUser } = useUser();
  const approved = isMatchable(user);
  const personName = clerkDisplayName(clerkUser) || user?.name || "—";

  async function signOut() {
    const confirmed = await askConfirm({
      question: "Sign out of GRIDGO on this phone?",
      consequence:
        "Your jobs and earnings stay with GRIDGO. You will need your email and password to get back in, and no job alerts will reach this phone until you do.",
      confirmLabel: "Sign out",
      cancelLabel: "Stay signed in",
      destructive: true,
    });
    if (confirmed) void logout();
  }

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-10"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Account" />

        {/* Identity first, and the one status that governs everything else. */}
        <View className="gg-card gap-3">
          <View className="gap-1">
            <Text className="text-h3 text-text-primary">{user?.supplierName || "Your shop"}</Text>
            <Text className="text-body text-text-secondary">{personName}</Text>
            <Text className="text-caption text-text-muted">{user?.email || "—"}</Text>
          </View>
          <View className="flex-row">
            {approved ? (
              <StatusChip tone="success" icon="circle-check" label="Accredited" />
            ) : (
              <StatusChip tone="warning" icon="clock" label="With Operations" />
            )}
          </View>
          <Text className="text-caption text-text-muted">
            {approved
              ? "GRIDGO matches work to your shop. Operations can pause that, and this screen says so if they ever do."
              : "Operations is reviewing your shop. No job is matched until they approve."}
          </Text>
        </View>

        <View className="mt-6 gap-2">
          <Text className="text-overline text-text-muted">YOUR SHOP</Text>
          {/*
            The board leads because it is the only thing here a client ever
            sees, and it is first for a waiting shop too: accreditation needs a
            finished listing, so this is work that shortens the wait rather than
            work that follows it. What GRIDGO may send you — the accreditation
            — sits under it, because those are two different questions and a
            shop that confuses them prices the wrong thing.
          */}
          <DestinationRow
            title="Your board"
            detail="What clients see: listings, prices, samples"
            onPress={() => router.push("/shop")}
          />
          {approved ? (
            <DestinationRow
              title="Services you offer"
              detail="The work GRIDGO may send you, and how each one is verified"
              onPress={() => router.push("/services")}
            />
          ) : null}
          <DestinationRow
            title="Where you print"
            detail={user?.shop?.label || "Set the pin every delivery fee is measured from"}
            onPress={() => router.push("/shop-location")}
          />
          {!approved ? (
            <DestinationRow
              title="Accreditation"
              detail="Papers and the wait — what Operations still needs from you"
              onPress={() => router.push("/accreditation")}
            />
          ) : null}
          {approved ? (
            <DestinationRow
              title="Capacity & closures"
              detail="What you can take on each day, and the days you are shut"
              onPress={() => router.push("/capacity")}
            />
          ) : null}
        </View>

        {approved ? (
          <View className="mt-6 gap-2">
            <Text className="text-overline text-text-muted">MONEY</Text>
            <DestinationRow
              title="Earnings"
              detail="What each job pays you, and what each part is waiting on"
              onPress={() => router.push("/payout")}
            />
          </View>
        ) : null}

        <View className="mt-6 gap-2">
          <Text className="text-overline text-text-muted">APP</Text>
          <DestinationRow
            title="Settings"
            detail="Theme, the product tour, and the connection this app is using"
            onPress={() => router.push("/settings" as Href)}
          />
        </View>

        <View className="mt-8">
          <SecondaryButton label="Sign out" onPress={() => void signOut()} />
        </View>
      </ScrollView>
    </View>
  );
}

function DestinationRow({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">{title}</Text>
        <Text className="text-caption text-text-muted" numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
    </Pressable>
  );
}
