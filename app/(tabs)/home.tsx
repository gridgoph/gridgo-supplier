import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { ObligationRow } from "@/components/ObligationRow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { buildObligations, greeting, homeHeadline, type Obligation } from "@/lib/homeBoard";
import { buildSchedule } from "@/lib/schedule";
import { useAlertsStore } from "@/store/alerts";
import { isMatchable, useSession } from "@/store/session";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The floor at a glance.
 *
 * A greeting and one figure, then everything the shop has to do today. The
 * trade is deliberate and the captain made it: the fold is smaller, so the top
 * of the screen has to earn its space in one line and one number.
 *
 * The figure is the shop's own money that has stopped moving — see the note in
 * `lib/homeBoard`. Underneath it, obligations in the order they should be
 * worked through, with the sharpest one carrying the screen's only yellow.
 */
export default function HomeScreen() {
  const { user, refresh } = useSession();
  const colors = useThemeColors();
  const syncAlerts = useAlertsStore((s) => s.syncFrom);
  const [jobs, setJobs] = useState<api.Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const waitingOnOps = !isMatchable(user);

  const reload = useCallback(async () => {
    if (waitingOnOps) {
      await refresh();
      return;
    }
    setLoading(true);
    try {
      const [list, notifications] = await Promise.all([
        api.listJobs(),
        api.listNotifications().catch(() => [] as api.Notification[]),
      ]);
      setJobs(list);
      syncAlerts(notifications);
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(humanizeApiError(e, offlineMessage("load your floor")));
    } finally {
      setLoading(false);
    }
  }, [refresh, syncAlerts, waitingOnOps]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const firstLoad = loading && !loaded;

  const headline = homeHeadline(jobs);
  const obligations = buildObligations(jobs);
  const [first, ...rest] = obligations;
  const summary = buildSchedule(jobs, "today").summary;

  function open(obligation: Obligation) {
    router.push({
      pathname: obligation.route,
      params: obligation.actionKind
        ? { id: obligation.orderId, action: obligation.actionKind }
        : { id: obligation.orderId },
    });
  }

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-10"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        {/*
          The mark is not here on purpose. A shop on its own floor knows whose
          app this is; what it does not know is what today looks like. So the
          header carries the shop's own name and the one fact that changes what
          it does next — what is promised today, and whether anything is late.
          The lockup lives at the door: sign-in, onboarding, accreditation.
        */}
        <ScreenHeader
          eyebrow={greeting(user?.name)}
          title={user?.supplierName || "Your shop"}
          right={
            firstLoad || waitingOnOps ? null : (
              <StatusChip
                tone={summary.late > 0 ? "error" : summary.today > 0 ? "info" : "neutral"}
                icon={summary.late > 0 ? "triangle-alert" : "clock"}
                label={
                  summary.late > 0
                    ? `${summary.late} late`
                    : summary.today > 0
                      ? `${summary.today} due today`
                      : "Nothing due today"
                }
              />
            )
          }
        />

        {/*
          Shaped to the screen that replaces it — the figure, the card with its
          action, two rows — so the floor does not grow under the shop's thumb
          the moment it lands.
        */}
        {waitingOnOps ? (
          <View className="mt-2">
            <EmptyState
              title="Operations is reviewing your shop"
              body="The floor stays empty until they approve."
              actionLabel="Open accreditation"
              onAction={() => router.push("/accreditation")}
            />
          </View>
        ) : null}

        {firstLoad && !waitingOnOps ? (
          <View accessibilityRole="progressbar" accessibilityLabel="Loading your floor">
            <View className="gg-card gap-2">
              <SkeletonBlock className="h-4 w-40" />
              <SkeletonBlock className="h-10 w-2/3" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-4/5" />
            </View>
            <View className="mt-6 gap-2">
              <SkeletonBlock className="h-4 w-16" />
              <View className="gg-card gap-5">
                <View className="gap-3">
                  <View className="flex-row items-center justify-between gap-3">
                    <SkeletonBlock className="h-4 w-28" />
                    <SkeletonBlock className="h-6 w-24 rounded-pill" />
                  </View>
                  <SkeletonBlock className="h-7 w-3/4" />
                  <SkeletonBlock className="h-5 w-2/3" />
                </View>
                <SkeletonBlock className="h-11 w-full" />
              </View>
              <SkeletonBlock className="h-16 w-full rounded-card" />
              <SkeletonBlock className="h-16 w-full rounded-card" />
            </View>
          </View>
        ) : null}

        {error && !loaded && !waitingOnOps ? (
          <EmptyState
            title="Your floor is not reachable"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {!waitingOnOps && !firstLoad && !(error && !loaded) ? (
          <>
            {/* One figure, in the same place every day. */}
            <Pressable
              onPress={() => router.push("/payout")}
              accessibilityRole="button"
              accessibilityLabel={`${headline.label}. Open earnings.`}
              className="gg-card flex-row items-start gap-3"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-caption text-text-muted">{headline.label}</Text>
                {/*
                  Monochrome, deliberately. This is the biggest type on the
                  screen and its label says exactly what it is; painting it
                  yellow as well would put a second attention magnet next to
                  the one action the screen wants pressed.
                */}
                <Text
                  className="text-display text-text-primary"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {api.formatPhp(headline.amountMinor)}
                </Text>
                <Text className="text-body text-text-secondary">{headline.detail}</Text>
              </View>
              <View className="pt-0.5">
                <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
              </View>
            </Pressable>

            {first ? (
              <View className="mt-6 gap-2">
                <Text className="text-overline text-text-muted">TODAY</Text>
                <NextCard obligation={first} onPress={() => open(first)} />
                {rest.map((obligation) => (
                  <ObligationRow
                    key={obligation.id}
                    obligation={obligation}
                    onPress={() => open(obligation)}
                  />
                ))}
                {rest.length === 0 ? (
                  <Text className="mt-1 text-caption text-text-muted">
                    Nothing else needs you today. Schedule shows what is coming.
                  </Text>
                ) : null}
              </View>
            ) : (
              <View className="mt-6">
                <EmptyState
                  title="Nothing owed today"
                  body="No job is waiting on a decision, a proof or a handover from you. Check Schedule for what is coming, or Jobs when GRIDGO matches new work."
                  actionLabel="Open schedule"
                  onAction={() => router.push("/(tabs)/schedule")}
                />
              </View>
            )}

            {error ? (
              <Text className="mt-4 text-caption text-text-muted">
                Last refresh did not reach GRIDGO, so these figures may be behind. Pull down to
                try again.
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * The one thing to do next, with the screen's only yellow.
 *
 * It states the job, where the job stands, what is owed, and what pressing the
 * button commits the shop to — the same sentence the flow screen will repeat,
 * so nothing is a surprise on the other side of the tap.
 */
function NextCard({ obligation, onPress }: { obligation: Obligation; onPress: () => void }) {
  return (
    <View className="gg-card gap-5">
      <View className="gap-3">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-overline text-text-muted">
            {obligation.kind === "proof" ? "MONEY WAITING ON YOU" : "NEEDS YOU NEXT"}
          </Text>
          <StatusChip
            tone={obligation.status.tone}
            icon={obligation.status.icon}
            label={obligation.status.label}
          />
        </View>
        <Text className="text-h2 text-text-primary">{obligation.title}</Text>
        {obligation.kind === "proof" && obligation.amountMinor != null ? (
          <Text className="text-body-lg font-medium text-text-primary">
            {api.formatPhp(obligation.amountMinor)} waits on this photo
          </Text>
        ) : null}
        <Text className="text-body text-text-secondary">{obligation.detail}</Text>
        {obligation.urgency === "overdue" ? (
          <Text className="text-body font-medium text-error">Past the promised time</Text>
        ) : null}
      </View>
      <PrimaryButton label={obligation.actionLabel} onPress={onPress} />
    </View>
  );
}
