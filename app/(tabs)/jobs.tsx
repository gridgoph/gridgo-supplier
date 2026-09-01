import { useCallback, useMemo, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { JobCard } from "@/components/JobCard";
import { JobDocketRail } from "@/components/JobDocketRail";
import { AlertsBell } from "@/components/AlertsBell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonList } from "@/components/Skeleton";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import {
  DEFAULT_JOB_BOARD_QUERY,
  emptyJobBoardCopy,
  filterJobs,
  isJobBoardNarrowed,
  jobStageCounts,
  type JobBoardQuery,
} from "@/lib/jobBoard";
import { needsSupplierAction } from "@/lib/jobState";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
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
  const [query, setQuery] = useState<JobBoardQuery>(DEFAULT_JOB_BOARD_QUERY);
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

  const counts = useMemo(() => jobStageCounts(jobs), [jobs]);
  const visible = useMemo(() => filterJobs(jobs, query), [jobs, query]);
  const { waiting, running } = useMemo(
    () => ({
      waiting: visible.filter(needsSupplierAction),
      running: visible.filter((j) => !needsSupplierAction(j)),
    }),
    [visible],
  );
  const narrowed = isJobBoardNarrowed(query);
  const emptyDocket = loaded && !error && jobs.length > 0 && visible.length === 0;
  const emptyCopy = emptyDocket ? emptyJobBoardCopy(query) : null;

  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const firstLoad = loading && !loaded;

  return (
    <View className="gg-screen">
      <FormScrollView
        contentClassName="gg-page pb-10"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        <ScreenHeader title="Jobs" right={<AlertsBell />} />

        {loaded && jobs.length > 0 ? (
          <JobDocketRail
            query={query}
            counts={counts}
            shown={visible.length}
            total={jobs.length}
            onChange={setQuery}
          />
        ) : null}

        {firstLoad ? (
          <SkeletonList label="Loading your assignments" count={3} sectioned />
        ) : null}

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

        {emptyCopy ? (
          <EmptyState
            title={emptyCopy.title}
            body={emptyCopy.body}
            actionLabel="Show all jobs"
            onAction={() => setQuery(DEFAULT_JOB_BOARD_QUERY)}
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

        {loaded && !error && jobs.length > 0 && !waiting.length && !narrowed ? (
          <Text className="mt-6 text-caption text-text-muted">
            Every job here is waiting on the client, GRIDGO, or a rider. You will see a new
            one the moment it needs your shop.
          </Text>
        ) : null}
      </FormScrollView>
    </View>
  );
}
