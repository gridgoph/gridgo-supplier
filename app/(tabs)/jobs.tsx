import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { JobCard } from "@/components/JobCard";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonList } from "@/components/Skeleton";
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

  const firstLoad = loading && !loaded;

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-10"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading && loaded}
            onRefresh={() => void reload()}
            tintColor={colors.textMuted}
          />
        }
      >
        <ScreenHeader
          title="Jobs"
          subtitle="Accept, produce, self-QC, hand off to the rider"
        />

        {firstLoad ? <SkeletonList label="Loading your assignments" count={3} /> : null}

        {error && !loaded ? (
          <EmptyState
            title="Jobs are not reachable"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : error ? (
          <View className="mb-6">
            <ErrorNotice message={error} onRetry={() => void reload()} />
          </View>
        ) : null}

        {loaded && !error && !jobs.length ? (
          <EmptyState
            title="No assignments yet"
            body="When GRIDGO matches a job to your shop, it lands here for accept or decline. Make sure the services you offer are up to date so the right work reaches you."
            actionLabel="Check your services"
            onAction={() => router.push("/services")}
            secondaryLabel="Set capacity"
            onSecondary={() => router.push("/capacity")}
          />
        ) : null}

        {waiting.length ? (
          <View className="gap-3">
            <SectionHeader title="NEEDS YOU" count={waiting.length} />
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
            <SectionHeader
              title="IN FLIGHT"
              count={running.length}
              hint="Nothing to do on these until someone else moves."
            />
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

        {loaded && !error && jobs.length > 0 && !waiting.length ? (
          <Text className="mt-6 text-caption text-text-muted">
            Every job here is waiting on the client, GRIDGO, or a rider. You will see a new
            one the moment it needs your shop.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
