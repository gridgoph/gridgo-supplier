import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { SkeletonList } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import {
  deriveProtectedPayment,
  isPayoutRelevant,
  matchesPayoutFilter,
  PAYOUT_FILTERS,
  presentPaymentMethod,
  type PayoutFilter,
} from "@/lib/payout";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Protected payment status per job.
 *
 * Demo ledger only — commission and net are labelled unavailable, not invented.
 */
export default function PayoutScreen() {
  const colors = useThemeColors();
  const [jobs, setJobs] = useState<api.Order[]>([]);
  const [filter, setFilter] = useState<PayoutFilter>("held");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setJobs(await api.listJobs());
      setError(null);
    } catch (e) {
      setError(humanizeApiError(e, offlineMessage("load your protected payments")));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const allRows = useMemo(
    () => jobs.filter(isPayoutRelevant).map(deriveProtectedPayment),
    [jobs],
  );
  const rows = useMemo(
    () => allRows.filter((row) => matchesPayoutFilter(row, filter)),
    [allRows, filter],
  );
  const heldTotal = allRows
    .filter((row) => matchesPayoutFilter(row, "held"))
    .reduce((sum, row) => sum + row.grossMinor, 0);

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void reload()}
            tintColor={colors.textMuted}
          />
        }
      >
        <View className="gap-2">
          <Text className="text-overline text-text-muted">HELD FOR YOUR SHOP</Text>
          <Text className="text-display text-text-primary">{api.formatPhp(heldTotal)}</Text>
          <Text className="text-body text-text-secondary">
            Protected payment holds the print total until a job settles. Delivery fees belong to
            the rider, and GRIDGO does not publish its commission or your net figure yet.
          </Text>
        </View>

        <View className="mt-6">
          <SegmentedControl
            options={PAYOUT_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
            value={filter}
            onChange={setFilter}
            accessibilityLabel="Protected payment filter"
          />
        </View>

        {loading && !jobs.length ? (
          <View className="mt-6">
            <SkeletonList label="Loading your protected payments" count={3} compact />
          </View>
        ) : null}

        {error ? (
          <View className="mt-6">
            <EmptyState
              title="Protected payment is not reachable"
              body={error}
              actionLabel="Try again"
              onAction={() => void reload()}
            />
          </View>
        ) : null}

        {!loading && !error && !rows.length ? (
          <View className="mt-6">
            <EmptyState
              title={
                allRows.length ? "Nothing in this view" : "No protected payments yet"
              }
              body={
                allRows.length
                  ? "Switch to All to see every job with money attached to it."
                  : "Once a client authorises payment on a job you accepted, it appears here with its settlement state."
              }
              actionLabel={allRows.length ? "Show all" : "Refresh"}
              onAction={() => (allRows.length ? setFilter("all") : void reload())}
            />
          </View>
        ) : null}

        <View className="mt-6 gap-3">
          {rows.map((row) => (
            <View key={row.orderId} className="gg-card gap-3">
              <View className="flex-row items-start justify-between gap-3">
                <Text className="min-w-0 flex-1 text-body font-medium text-text-secondary">
                  {row.title}
                </Text>
                <StatusChip tone={row.tone} label={row.settlementLabel} icon={row.icon} />
              </View>

              <View className="gap-0.5">
                <Text className="text-h2 text-text-primary">
                  {api.formatPhp(row.grossMinor)}
                </Text>
                <Text className="text-caption text-text-muted">
                  Print total · paid by {presentPaymentMethod(row.paymentMethod).toLowerCase()}
                  {row.deliveryFeeMinor > 0
                    ? ` · ${api.formatPhp(row.deliveryFeeMinor)} delivery to the rider`
                    : ""}
                </Text>
              </View>

              {row.holdReason ? (
                <Text className="text-body text-text-secondary">{row.holdReason}</Text>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
