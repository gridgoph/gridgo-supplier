import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useUser } from "@clerk/expo";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";

import { AlertsBell } from "@/components/AlertsBell";
import { EmptyState } from "@/components/EmptyState";
import { ObligationRow } from "@/components/ObligationRow";
import { SamplePhoto } from "@/components/SamplePhoto";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { clerkDisplayName } from "@/lib/clerk";
import { buildObligations, greeting, homeHeadline, type Obligation } from "@/lib/homeBoard";
import { boardCountLine, boardPrompt, type Listing, type ServiceLine } from "@/lib/listings";
import { loadBoard } from "@/lib/listingsApi";
import { useAlertsStore } from "@/store/alerts";
import { isMatchable, useSession } from "@/store/session";
import { loadServiceLines } from "@/hooks/useBoard";
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
  const { user: clerkUser } = useUser();
  const colors = useThemeColors();
  const refreshAlerts = useAlertsStore((s) => s.refresh);
  const [jobs, setJobs] = useState<api.Order[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [services, setServices] = useState<ServiceLine[]>([]);
  // False while GRIDGO has no board routes: nothing to nag a shop about.
  const [boardOpen, setBoardOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const waitingOnOps = !isMatchable(user);

  /**
   * The board rides along with the floor.
   *
   * It is a second, quieter question — is there anything for a client to
   * choose? — and it must never delay or break the first one, so it is loaded
   * beside the jobs and its failures are simply an absent card rather than an
   * error on a screen about work.
   */
  const loadBoardQuietly = useCallback(async (current: () => boolean) => {
    const [board, lines] = await Promise.all([loadBoard(), loadServiceLines()]);
    if (!current()) return;
    setServices(lines);
    setListings(board.status === "ok" ? board.value.listings : []);
    setBoardOpen(board.status === "ok");
  }, []);

  const beginRead = useReadVersion();
  const reload = useCallback(async () => {
    const current = beginRead();
    if (waitingOnOps) {
      await Promise.all([refresh(), loadBoardQuietly(current)]);
      return;
    }
    setLoading(true);
    try {
      const [list] = await Promise.all([
        api.listJobs(),
        refreshAlerts().catch(() => []),
        loadBoardQuietly(current),
      ]);
      if (!current()) return;
      setJobs(list);
      setError(null);
      setLoaded(true);
    } catch (e) {
      if (!current()) return;
      setError(humanizeApiError(e, offlineMessage("load your floor")));
    } finally {
      if (current()) setLoading(false);
    }
  }, [beginRead, loadBoardQuietly, refresh, refreshAlerts, waitingOnOps]);

  useLiveRefresh(["jobs", "orders", "payouts", "identity", "approvals", "catalog", "services", "availability"], reload);

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
  const board = boardOpen ? boardPrompt(listings, services, !waitingOnOps) : null;
  const needsBoardWork = board != null && board.kind !== "ready";

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
          header carries the shop's own name, and the corner carries the inbox.
          The lockup lives at the door: sign-in, onboarding, accreditation.

          What used to sit in that corner was a chip counting today's jobs. It
          was not alerts and it read as alerts, which is the worst of both — so
          the corner is now a real bell, on this masthead and every other one in
          the bar. What is due and what is late is said properly below, on the
          obligations this screen is built around, and again on Schedule.
        */}
        <ScreenHeader
          eyebrow={greeting(clerkDisplayName(clerkUser) || user?.name)}
          title={user?.supplierName || "Your shop"}
          right={<AlertsBell />}
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
              {...(board
                ? {
                    secondaryLabel: "Build your board while you wait",
                    onSecondary: () => router.push("/(tabs)/catalogues"),
                  }
                : {})}
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
                {/*
                  With nothing owed, the sharpest thing on this screen is an
                  unfinished board — so the yellow goes there and schedule
                  steps down to a quiet action. One yellow, always on the thing
                  most worth doing next.
                */}
                <EmptyState
                  title="Nothing owed today"
                  body="No job is waiting on a decision, a proof or a handover from you. Check Schedule for what is coming, or Jobs when GRIDGO matches new work."
                  {...(needsBoardWork
                    ? {
                        secondaryLabel: "Open schedule",
                        onSecondary: () => router.push("/(tabs)/schedule"),
                      }
                    : {
                        actionLabel: "Open schedule",
                        onAction: () => router.push("/(tabs)/schedule"),
                      })}
                />
              </View>
            )}

            {board ? (
              <View className="mt-8 gap-2">
                <Text className="text-overline text-text-muted">YOUR BOARD</Text>
                {board.kind === "ready" ? (
                  <SampleStrip listings={listings} />
                ) : (
                  <BoardCard prompt={board} quiet={Boolean(first)} />
                )}
              </View>
            ) : null}

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
        {/*
          The overline and the state chip share a row only while both fit. A
          long state ("Client can still report") beside the long overline was
          pushed clean off the card, so the row wraps and the chip drops under
          the overline instead of being clipped.
        */}
        <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <Text className="shrink text-overline text-text-muted">
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

/**
 * The board, when it still needs something.
 *
 * It takes the screen's yellow only when the floor has no obligation to carry
 * it — a shop with a proof owed on a delivered job should not be pulled into
 * writing product copy, and two yellows on one screen means neither of them is
 * the next thing to do.
 */
function BoardCard({
  prompt,
  quiet,
}: {
  prompt: NonNullable<ReturnType<typeof boardPrompt>>;
  quiet: boolean;
}) {
  return (
    <View className="gg-card gap-3">
      <Text className="text-h3 text-text-primary">{prompt.title}</Text>
      <Text className="text-body text-text-secondary">{prompt.body}</Text>
      {quiet ? (
        <SecondaryButton label={prompt.actionLabel} onPress={() => router.push("/(tabs)/catalogues")} />
      ) : (
        <PrimaryButton label={prompt.actionLabel} onPress={() => router.push("/(tabs)/catalogues")} />
      )}
    </View>
  );
}

/**
 * The finished board, at a glance.
 *
 * Deliberately not a second ranking: it is the shop's own board order, cropped
 * to what fits on one row, and its only job is to be a door. A shop that wants
 * to read its board opens its board.
 */
function SampleStrip({ listings }: { listings: Listing[] }) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={() => router.push("/(tabs)/catalogues")}
      accessibilityRole="button"
      accessibilityLabel={`Open your board. ${boardCountLine(listings.length)}.`}
      className="gg-card-flush px-3 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1 flex-row">
          {listings.slice(0, 4).map((listing) => (
            <View key={listing.id} className="w-1/4">
              <SamplePhoto
                fileId={listing.photos[0]?.fileId}
                altText={listing.name}
                gutter="tight"
                emptyLabel=""
              />
            </View>
          ))}
        </View>
        <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
      </View>
      <Text className="mt-2 text-caption text-text-muted">
        {listings.length === 1
          ? "1 listing on your board"
          : `${listings.length} listings on your board`}
      </Text>
    </Pressable>
  );
}
