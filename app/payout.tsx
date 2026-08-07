import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import * as api from "@/lib/api";
import {
  deriveProtectedPayment,
  isPayoutRelevant,
  presentPaymentMethod,
} from "@/lib/payout";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Protected payment status per job.
 * Demo ledger only — commission and net are labelled unavailable, not invented.
 */
export default function PayoutScreen() {
  const colors = useThemeColors();
  const [jobs, setJobs] = useState<api.Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setJobs(await api.listJobs());
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Cannot load protected payment from ${api.getApiBase()}.`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const rows = useMemo(
    () => jobs.filter(isPayoutRelevant).map(deriveProtectedPayment),
    [jobs],
  );

  return (
    <View className="gg-screen">
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-4 pb-12 pt-4" showsVerticalScrollIndicator={false}>
        <Text className="text-body text-text-secondary">
          Protected payment holds the print total until the job settles. Delivery
          fees are listed separately and are not supplier revenue.
        </Text>

        {loading && !jobs.length ? (
          <View className="items-center py-12">
            <ActivityIndicator color={colors.textMuted} />
            <Text className="mt-3 text-body text-text-muted">Loading ledger…</Text>
          </View>
        ) : null}

        {error ? (
          <EmptyState
            title="Ledger unavailable"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {!loading && !error && !rows.length ? (
          <EmptyState
            title="No protected payments yet"
            body="Once a client authorises payment on a job you accepted, it appears here with its settlement state."
            actionLabel="Refresh"
            onAction={() => void reload()}
          />
        ) : null}

        {rows.map((row) => (
          <View key={row.orderId} className="gg-card gap-3">
            <View className="flex-row items-start justify-between gap-3">
              <Text className="min-w-0 flex-1 text-body-lg font-medium text-text-primary">
                {row.title}
              </Text>
              <StatusChip tone={row.tone} label={row.settlementLabel} icon={row.icon} />
            </View>

            <View>
              <SpecRow label="Gross (print)" value={api.formatPhp(row.grossMinor)} />
              <SpecRow label="Delivery fee" value={api.formatPhp(row.deliveryFeeMinor)} />
              <SpecRow
                label="GRIDGO commission"
                value="Not on demo ledger"
              />
              <SpecRow label="Net to shop" value="Not on demo ledger" />
              <SpecRow label="Payment method" value={presentPaymentMethod(row.paymentMethod)} />
            </View>

            {row.holdReason ? (
              <Text className="text-caption text-text-secondary">{row.holdReason}</Text>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
