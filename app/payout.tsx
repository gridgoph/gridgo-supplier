import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { MilestoneList } from "@/components/MilestoneList";
import { SkeletonList } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { addSplits } from "@/lib/milestones";
import {
  matchesPayoutFilter,
  payoutRows,
  PAYOUT_FILTERS,
  sortPayoutRows,
  unreleasedMinor,
  type PayoutFilter,
} from "@/lib/payout";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * What the shop has earned, and where each part of it is stuck.
 *
 * Every figure is the shop's own money. GRIDGO's charge on top and the delivery
 * fee are not the shop's to see or to count, and the client's total says
 * nothing about what this shop is paid.
 *
 * There is no filter for "pending proof" versus "awaiting release" because
 * those are properties of a *part* of a job, not of a job — one job routinely
 * has one part released, one with GRIDGO and one still owing evidence. The
 * separation lives inside each row, which is where it is true.
 */
export default function PayoutScreen() {
  const colors = useThemeColors();
  const [jobs, setJobs] = useState<api.Order[]>([]);
  const [filter, setFilter] = useState<PayoutFilter>("unsettled");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setJobs(await api.listJobs());
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(humanizeApiError(e, offlineMessage("load your earnings")));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const allRows = useMemo(() => sortPayoutRows(payoutRows(jobs)), [jobs]);
  const rows = useMemo(
    () => allRows.filter((row) => matchesPayoutFilter(row, filter)),
    [allRows, filter],
  );
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  const total = useMemo(() => addSplits(allRows.map((row) => row.split)), [allRows]);
  const outstanding = unreleasedMinor(total);
  const firstLoad = loading && !loaded;

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        <View className="gap-2">
          <Text className="text-overline text-text-muted">STILL TO REACH YOU</Text>
          <Text className="text-display text-text-primary">
            {api.formatPhp(outstanding)}
          </Text>
          <Text className="text-body text-text-secondary">
            Every job pays out in four parts, and each one needs evidence before GRIDGO releases
            it. Delivery fees and GRIDGO&apos;s own charge sit outside what you earn.
          </Text>
        </View>

        {outstanding > 0 ? (
          <View className="gg-card mt-4 gap-3">
            <SplitRow
              label="Waiting on your evidence"
              amountMinor={total.needsProofMinor}
              hint="Photograph the work and file it against the part it pays for."
            />
            <View className="gg-divider" />
            <SplitRow
              label="With GRIDGO"
              amountMinor={total.awaitingReleaseMinor}
              hint="Filed and under review. Operations releases these."
            />
            {total.heldMinor > 0 ? (
              <>
                <View className="gg-divider" />
                <SplitRow
                  label="Held by a client report"
                  amountMinor={total.heldMinor}
                  hint="Operations settles the report before this moves."
                  tone="error"
                />
              </>
            ) : null}
            {total.laterMinor > 0 ? (
              <>
                <View className="gg-divider" />
                {/*
                  Parts the job has not reached, and the rider's delivered
                  share. Counted separately because nothing here is work the
                  shop can do today — folding it into the row above turned a
                  real prompt into a number that never went down.
                */}
                <SplitRow
                  label="Later in the job"
                  amountMinor={total.laterMinor}
                  hint="Not reached yet, or waiting on the rider. Nothing for you to file."
                />
              </>
            ) : null}
          </View>
        ) : null}

        <View className="mt-6">
          <SegmentedControl
            options={PAYOUT_FILTERS}
            value={filter}
            onChange={setFilter}
            accessibilityLabel="Earnings filter"
          />
        </View>

        {firstLoad ? (
          <View className="mt-6">
            <SkeletonList label="Loading your earnings" count={3} />
          </View>
        ) : null}

        {error && !loaded ? (
          <View className="mt-6">
            <EmptyState
              title="Your earnings are not reachable"
              body={error}
              actionLabel="Try again"
              onAction={() => void reload()}
            />
          </View>
        ) : null}

        {loaded && !rows.length ? (
          <View className="mt-6">
            <EmptyState
              title={allRows.length ? "Nothing in this view" : "No earnings yet"}
              body={
                allRows.length
                  ? "Switch to All to see every job you have been paid for."
                  : "Accept a job and name your price, and the four parts you are paid in appear here as you work through it."
              }
              actionLabel={allRows.length ? "Show all" : "Open jobs"}
              onAction={() =>
                allRows.length ? setFilter("all") : router.navigate("/(tabs)/jobs")
              }
            />
          </View>
        ) : null}

        <View className="mt-6 gap-3">
          {rows.map((row) => (
            <Pressable
              key={row.orderId}
              onPress={() =>
                router.push({ pathname: "/job/[id]", params: { id: row.orderId } })
              }
              accessibilityRole="button"
              accessibilityLabel={`Open ${row.title}`}
              className="gg-touch gg-card gap-4"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-body font-medium text-text-primary">{row.title}</Text>
                  <Text className="text-caption text-text-muted">
                    {api.formatPhp(row.split.releasedMinor)} of{" "}
                    {api.formatPhp(row.split.totalMinor)} released
                  </Text>
                </View>
                {row.held ? (
                  <StatusChip tone="error" label="Held" icon="triangle-alert" />
                ) : (
                  <ChevronRight
                    size={20}
                    color={colors.textMuted}
                    accessibilityElementsHidden
                  />
                )}
              </View>

              <View className="gg-divider" />
              <MilestoneList milestones={row.milestones} />
            </Pressable>
          ))}
        </View>

        {error && loaded ? (
          <Text className="mt-4 text-caption text-text-muted">
            Last refresh did not reach GRIDGO, so these figures may be behind. Pull down to try
            again.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SplitRow({
  label,
  amountMinor,
  hint,
  tone = "neutral",
}: {
  label: string;
  amountMinor: number;
  hint: string;
  tone?: "neutral" | "error";
}) {
  return (
    <View className="gap-0.5">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text
          className={
            tone === "error"
              ? "min-w-0 flex-1 text-body font-medium text-error"
              : "min-w-0 flex-1 text-body text-text-secondary"
          }
        >
          {label}
        </Text>
        <Text className="text-body-lg font-medium text-text-primary">
          {api.formatPhp(amountMinor)}
        </Text>
      </View>
      <Text className="text-caption text-text-muted">{hint}</Text>
    </View>
  );
}
