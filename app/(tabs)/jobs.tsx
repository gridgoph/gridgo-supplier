import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { JobCard } from "@/components/JobCard";
import { ScreenHeader } from "@/components/ScreenHeader";
import * as api from "@/lib/api";
import { needsSupplierAction } from "@/lib/jobState";
import { useThemeColors } from "@/hooks/useTheme";

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
      setError(
        e instanceof Error
          ? e.message
          : `Cannot load jobs from ${api.getApiBase()}. Check that gridgo-api is running.`,
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

  const sorted = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const aNeed = needsSupplierAction(a) ? 0 : 1;
      const bNeed = needsSupplierAction(b) ? 0 : 1;
      if (aNeed !== bNeed) return aNeed - bNeed;
      return String(a.deadline || a.promisedDate || "").localeCompare(
        String(b.deadline || b.promisedDate || ""),
      );
    });
  }, [jobs]);

  return (
    <View className="gg-screen">
      <ScrollView className="flex-1" contentContainerClassName="gg-page pb-10" showsVerticalScrollIndicator={false}>
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

        {!loading && !error && !sorted.length ? (
          <EmptyState
            title="No assignments yet"
            body="When Operations matches a job to your shop, it lands here for accept or decline."
            actionLabel="Refresh"
            onAction={() => void reload()}
          />
        ) : null}

        <View className="gap-3">
          {sorted.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onPress={() => router.push(`/job/${job.id}`)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
