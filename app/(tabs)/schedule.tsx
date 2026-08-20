import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { JobRow } from "@/components/JobRow";
import { ScheduleDayCard } from "@/components/ScheduleDayCard";
import { AlertsBell } from "@/components/AlertsBell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonList } from "@/components/Skeleton";
import { StatTile } from "@/components/StatTile";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { blackoutOnDay } from "@/lib/blackouts";
import { shopDailyCapacity } from "@/lib/capacity";
import { buildSchedule, SCHEDULE_RANGES, type ScheduleRange } from "@/lib/schedule";
import { useShopPlan } from "@/store/shopPlan";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The shop's working week.
 *
 * Late first, then a day at a time with the load already committed to each one.
 * Density is the point — this is read between jobs, not browsed.
 */
export default function ScheduleScreen() {
  const colors = useThemeColors();
  const blackouts = useShopPlan((s) => s.blackouts);
  const [jobs, setJobs] = useState<api.Order[]>([]);
  const [services, setServices] = useState<api.SupplierService[]>([]);
  const [range, setRange] = useState<ScheduleRange>("week");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "Late" and "Today" are read against the clock at load time, so a screen
  // left open overnight re-dates itself on the next refresh rather than
  // quietly claiming yesterday's jobs are still due today.
  const [now, setNow] = useState(() => new Date());

  const reload = useCallback(async () => {
    setLoading(true);
    setNow(new Date());
    try {
      const [jobList, serviceList] = await Promise.all([
        api.listJobs(),
        // Capacity is a nice-to-have on this screen; a shop with no service
        // lines still gets its agenda.
        api.listSupplierServices().catch(() => [] as api.SupplierService[]),
      ]);
      setJobs(jobList);
      setServices(serviceList);
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(humanizeApiError(e, offlineMessage("load your schedule")));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const schedule = useMemo(() => buildSchedule(jobs, range, now), [jobs, range, now]);
  const dailyCapacity = useMemo(() => shopDailyCapacity(services), [services]);
  const hasAnything =
    schedule.days.some((d) => d.jobs.length > 0) ||
    schedule.lateJobs.length > 0 ||
    schedule.undatedJobs.length > 0;
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const firstLoad = loading && !loaded;

  function openJob(jobId: string) {
    router.push({ pathname: "/job/[id]", params: { id: jobId } });
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
        <ScreenHeader
          title="Schedule"
          subtitle="What is due, what is late, what is next"
          right={<AlertsBell />}
        />

        <SegmentedControl
          options={SCHEDULE_RANGES}
          value={range}
          onChange={setRange}
          accessibilityLabel="Schedule range"
        />

        <View className="mt-4 flex-row gap-3">
          <StatTile label="Late" value={schedule.summary.late} tone="error" />
          <StatTile label="Due today" value={schedule.summary.today} />
          <StatTile label="This week" value={schedule.summary.week} />
        </View>

        {firstLoad ? (
          <View className="mt-8">
            <SkeletonList label="Loading your week" variant="row" count={4} sectioned />
          </View>
        ) : null}

        {error && !loaded ? (
          <View className="mt-6">
            <EmptyState
              title="Your week is not reachable"
              body={error}
              actionLabel="Try again"
              onAction={() => void reload()}
            />
          </View>
        ) : error ? (
          <View className="mt-6">
            <ErrorNotice message={error} onRetry={() => void reload()} />
          </View>
        ) : null}

        {loaded && !error && !hasAnything ? (
          <View className="mt-6">
            <EmptyState
              title="Nothing booked in"
              body="Accepted jobs appear here on the day you promised them. Open Jobs to take on the work GRIDGO has matched to your shop."
              actionLabel="Open jobs"
              onAction={() => router.push("/(tabs)/jobs")}
            />
          </View>
        ) : null}

        {schedule.lateJobs.length ? (
          <View className="mt-8 gap-3">
            <SectionHeader
              title="LATE"
              count={schedule.lateJobs.length}
              tone="error"
              hint="Past the day you promised. Tell the client where it stands."
            />
            <View className="gap-2">
              {schedule.lateJobs.map((job) => (
                <JobRow key={job.id} job={job} now={now} onPress={() => openJob(job.id)} />
              ))}
            </View>
          </View>
        ) : null}

        <View className="mt-8 gap-7">
          {schedule.days.map((day) => (
            <ScheduleDayCard
              key={day.dayKey}
              day={day}
              now={now}
              dailyCapacity={dailyCapacity}
              closure={blackoutOnDay(blackouts, day.dayKey)}
              onOpenJob={openJob}
            />
          ))}
        </View>

        {schedule.undatedJobs.length ? (
          <View className="mt-8 gap-3">
            <SectionHeader
              title="NO DATE SET"
              count={schedule.undatedJobs.length}
              hint="Accepting one of these is where you promise its finish time."
            />
            <View className="gap-2">
              {schedule.undatedJobs.map((job) => (
                <JobRow key={job.id} job={job} now={now} onPress={() => openJob(job.id)} />
              ))}
            </View>
          </View>
        ) : null}

        <View className="mt-10 gap-2">
          <SecondaryButton
            label="Capacity & closures"
            onPress={() => router.push("/capacity")}
          />
          {dailyCapacity == null ? (
            <Text className="text-caption text-text-muted">
              Set a daily capacity so this screen can warn you before a day is oversold.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
