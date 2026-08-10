import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { JobCard } from "@/components/JobCard";
import { ScreenHeader } from "@/components/ScreenHeader";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { needsSupplierAction } from "@/lib/jobState";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Every job GRIDGO has matched to this shop.
 *
 * Split by whether the shop has to do something, because that is the only
 * question a supplier opens this tab to answer.
 */
export default function JobsScreen() {
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
      setError(humanizeApiError(e, offlineMessage("load your jobs")));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const { waiting, running } = useMemo(() => {
    const byDate = (a: api.Order, b: api.Order) =>
      String(a.deadline || a.promisedDate || "").localeCompare(
        String(b.deadline || b.promisedDate || ""),
      );
    return {
      waiting: jobs.filter(needsSupplierAction).sort(byDate),
      running: jobs.filter((j) => !needsSupplierAction(j)).sort(byDate),
    };
  }, [jobs]);

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-10"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void reload()}
            tintColor={colors.textMuted}
          />
        }
      >
        <ScreenHeader
          title="Jobs"
          subtitle="Accept, produce, self-QC, hand off to the rider"
        />

        {loading && !jobs.length ? (
          <View className="items-center py-12">
            <ActivityIndicator color={colors.textMuted} />
            <Text className="mt-3 text-body text-text-muted">Loading assignments…</Text>
          </View>
        ) : null}

        {error ? (
          <EmptyState
            title="Could not load jobs"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {!loading && !error && !jobs.length ? (
          <EmptyState
            title="No assignments yet"
            body="When Operations matches a job to your shop, it lands here for accept or decline. Set your capacity so GRIDGO knows what to send you."
            actionLabel="Set capacity"
            onAction={() => router.push("/capacity")}
          />
        ) : null}

        {waiting.length ? (
          <View className="gap-3">
            <Text className="text-overline text-text-muted">
              NEEDS YOU · {waiting.length}
            </Text>
            {waiting.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onPress={() => router.push({ pathname: "/job/[id]", params: { id: job.id } })}
              />
            ))}
          </View>
        ) : null}

        {running.length ? (
          <View className={waiting.length ? "mt-8 gap-3" : "gap-3"}>
            <Text className="text-overline text-text-muted">
              IN FLIGHT · {running.length}
            </Text>
            {running.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                showSpec={false}
                onPress={() => router.push({ pathname: "/job/[id]", params: { id: job.id } })}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
