import { useUser } from "@clerk/expo";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";

import { AlertsBell } from "@/components/AlertsBell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ShopPortrait } from "@/components/ShopPortrait";
import { StatusChip } from "@/components/StatusChip";
import * as api from "@/lib/api";
import { clerkDisplayName } from "@/lib/clerk";
import { standingLine } from "@/lib/reviews";
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
  const refresh = useSession((s) => s.refresh);
  const { user: clerkUser } = useUser();
  const colors = useThemeColors();
  const approved = isMatchable(user);
  const personName = clerkDisplayName(clerkUser) || user?.name || "—";

  /*
   * Read the account again every time this screen comes back into view.
   *
   * The shop name on this card is GRIDGO's, and the screen that corrects it is
   * one tap away — so the moment a shop is most likely to look at this card is
   * the moment straight after changing it. Trusting whatever the session held
   * on the way out is how a shop renames itself, comes back, and finds the old
   * name still sitting here.
   */
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  /*
   * The shop's standing, read fresh with the account. It is the one line on
   * this screen that changes without the shop doing anything, and the row it
   * sits on is the only place a shop learns a new review has landed. A failed
   * read leaves the row's plain description; the number is a courtesy, not
   * a gate.
   */
  const [standing, setStanding] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!approved) return;
      let cancelled = false;
      api
        .getMyReviews()
        .then((mine) => {
          if (!cancelled) setStanding(standingLine(mine.summary, mine.ranking));
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [approved]),
  );

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
        <ScreenHeader title="Account" right={<AlertsBell />} />

        {/*
          Identity first, and the one status that governs everything else.

          The card is also the way into correcting it. This is where a shop
          reads its own name, so it is where a wrong one is noticed, and a fact
          you can see but not reach is the thing that sends a shop to
          Operations for a typo. The chevron is the same one every destination
          below uses, so the card reads as a way through rather than a panel
          that happens to respond to a tap.
        */}
        <Pressable
          onPress={() => router.push("/shop-details")}
          accessibilityRole="button"
          accessibilityLabel="Your shop details"
          accessibilityHint="Change your shop photo, name, contact person, number and email"
          className="gg-card gap-3"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <View className="flex-row items-center gap-3">
            <ShopPortrait
              imageUrl={clerkUser?.imageUrl}
              shopName={user?.supplierName || "Your shop"}
              size={56}
            />
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-h3 text-text-primary" numberOfLines={2}>
                {user?.supplierName || "Your shop"}
              </Text>
              <Text className="text-body text-text-secondary" numberOfLines={1}>
                {personName}
              </Text>
              <Text className="text-caption text-text-muted" numberOfLines={1}>
                {user?.email || "—"}
              </Text>
            </View>
            <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
          </View>
          {/*
            The chip sits under the whole row rather than beside the name, so it
            reads as the standing of the shop and not as a label on the picture.
            Approved shops get the chip and nothing else — the sentence that
            used to follow it explained a rule nobody was about to break, and a
            paragraph a shop reads once and skips forever is a paragraph that
            teaches it to skip the one under it that matters.
          */}
          <View className="flex-row">
            {approved ? (
              <StatusChip tone="success" icon="circle-check" label="Accredited" />
            ) : (
              <StatusChip tone="warning" icon="clock" label="With Operations" />
            )}
          </View>
          {approved ? null : (
            <Text className="text-caption text-text-muted">
              Operations is reviewing your shop. No job is matched until they approve.
            </Text>
          )}
        </Pressable>

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
            onPress={() => router.push("/(tabs)/catalogues")}
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
              title="Reviews & ranking"
              detail={standing ?? "What clients said about each job, and where you rank"}
              onPress={() => router.push("/reviews" as Href)}
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
            <DestinationRow
              title="Where you get paid"
              detail="The QR and account Operations pays your jobs to"
              onPress={() => router.push("/payout-account" as Href)}
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
