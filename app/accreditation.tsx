import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { GridgoLogo } from "@/components/GridgoLogo";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";
import { PUBLISHED_CATALOG } from "@/data/serviceCatalog";
import type { VerificationStatus } from "@/lib/api";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import { useSession } from "@/store/session";

/**
 * Where a shop waits.
 *
 * A shop that has signed itself up is signed in but not matchable: GRIDGO will
 * not send it work until Operations approves the account. The floor, the job
 * list and the schedule would all be empty in that state and every one of them
 * would read as "quiet today" rather than "you are not live yet" — so an
 * unapproved shop gets this screen instead of the tab shell, and it says the
 * one true thing plus the one useful thing it can still do.
 */
export default function AccreditationScreen() {
  const user = useSession((s) => s.user);
  const refresh = useSession((s) => s.refresh);
  const logout = useSession((s) => s.logout);
  const colors = useThemeColors();
  const [checking, setChecking] = useState(false);

  const reload = useCallback(async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  }, [refresh]);

  // An approval that lands while the shop has the app open should be picked up
  // without a sign-out, so returning to this screen re-reads the account.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const status = presentVerification(user?.verificationStatus);
  const ranked = user?.categoryRanks ?? [];

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        <ScreenHeader
          title={user?.supplierName || "Your shop"}
          subtitle="Accreditation"
          right={<GridgoLogo size={40} role="supplier" />}
        />

        <View className="gg-card gap-4">
          <View className="flex-row">
            <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
          </View>
          <Text className="text-h3 text-text-primary">{status.headline}</Text>
          <Text className="text-body text-text-secondary">{status.body}</Text>
          {user?.verificationNote ? (
            <View className="gg-panel gap-1">
              <Text className="text-caption text-text-muted">From Operations</Text>
              <Text className="text-body text-text-primary">{user.verificationNote}</Text>
            </View>
          ) : null}
        </View>

        <View className="gg-card mt-6">
          <Text className="mb-2 text-overline text-text-muted">WHAT GRIDGO HAS</Text>
          <SpecRow label="Shop" value={user?.supplierName || "—"} />
          <SpecRow label="Contact" value={user?.name || "—"} />
          <SpecRow label="Email" value={user?.email || "—"} />
          <SpecRow label="Address" value={user?.shop?.label || "—"} />
        </View>

        {ranked.length ? (
          <View className="mt-6 gap-2">
            <Text className="text-overline text-text-muted">WHAT YOU SAID YOU PRINT</Text>
            <View className="gg-card gap-3">
              {[...ranked]
                .sort((a, b) => a.rank - b.rank)
                .map((entry) => (
                  <View key={entry.categoryCode} className="flex-row items-start gap-3">
                    <Text className="text-body font-bold text-text-primary">{entry.rank}</Text>
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="text-body text-text-secondary">
                        {categoryName(entry.categoryCode)}
                      </Text>
                      {entry.rank === 1 ? (
                        <Text className="text-caption text-text-muted">What you do best</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
            </View>
            <Text className="text-caption text-text-muted">
              Ask Operations if this order needs to change.
            </Text>
          </View>
        ) : null}

        <View className="mt-8 gap-3">
          <SecondaryButton
            label={checking ? "Checking…" : "Check again"}
            disabled={checking}
            onPress={() => void reload()}
          />
          <SecondaryButton label="Settings" onPress={() => router.push("/settings")} />
        </View>

        <Pressable
          onPress={() => void logout()}
          accessibilityRole="button"
          className="gg-btn-secondary mt-6"
        >
          <Text className="text-button text-text-primary">Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function categoryName(code: string): string {
  return PUBLISHED_CATALOG.find((category) => category.code === code)?.name ?? code;
}

type VerificationPresentation = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  headline: string;
  body: string;
};

/**
 * Each accreditation state in the shop's own words. None of them names the
 * platform's own status string, and none of them implies the shop is live.
 */
function presentVerification(
  status: VerificationStatus | undefined,
): VerificationPresentation {
  switch (status) {
    case "rejected":
      return {
        label: "Not accredited",
        tone: "error",
        icon: "circle-x",
        headline: "GRIDGO cannot accredit this shop yet",
        body: "Operations has decided against accrediting this account. Their reason is below if they left one — talk to them about what would need to change.",
      };
    case "suspended":
      return {
        label: "Suspended",
        tone: "error",
        icon: "triangle-alert",
        headline: "Your shop is paused",
        body: "GRIDGO has stopped sending you new work. Jobs already on your floor are not affected. Operations can tell you what it takes to start again.",
      };
    default:
      return {
        label: "With Operations",
        tone: "warning",
        icon: "clock",
        headline: "Operations is checking your shop",
        body: "Your account exists and everything you sent is with GRIDGO. No job will be matched to you until they approve it, so there is nothing on your floor yet. They will let you know, and this screen updates when it clears.",
      };
  }
}
