import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StatusChip } from "@/components/StatusChip";
import { formatDeadlineLabel, formatDeadlineTime } from "@/lib/dates";
import * as api from "@/lib/api";
import { presentOrderState } from "@/lib/jobState";
import { buildAgenda } from "@/lib/schedule";
import { useThemeColors } from "@/hooks/useTheme";

export default function ScheduleScreen() {
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
          : `Cannot load schedule from ${api.getApiBase()}.`,
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

  const sections = useMemo(() => buildAgenda(jobs), [jobs]);
  const hasAny = sections.some((s) => s.jobs.length > 0);

  return (
    <View className="gg-screen">
      <ScrollView className="flex-1" contentContainerClassName="gg-page pb-10" showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Schedule"
          subtitle="Today and the next 7 days"
        />

        {loading && !jobs.length ? (
          <View className="items-center py-12">
            <ActivityIndicator color={colors.textMuted} />
            <Text className="mt-3 text-body text-text-muted">Loading agenda…</Text>
          </View>
        ) : null}

        {error ? (
          <EmptyState
            title="Schedule unavailable"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {!loading && !error && !hasAny ? (
          <EmptyState
            title="Nothing on the agenda"
            body="Accepted jobs with a promised date appear here. Accept work from Jobs to fill this week."
            actionLabel="Open jobs"
            onAction={() => router.push("/(tabs)/jobs")}
          />
        ) : null}

        <View className="gap-6">
          {sections.map((section) => {
            if (!section.jobs.length) {
              if (section.id === "today" || section.id === "next7") {
                return (
                  <View key={section.id} className="gap-3">
                    <Text className="text-overline text-text-muted">
                      {section.title.toUpperCase()}
                    </Text>
                    <View className="gg-panel">
                      <Text className="text-body text-text-secondary">
                        {section.id === "today"
                          ? "No promised finishes today."
                          : "No jobs in the next 7 days."}
                      </Text>
                    </View>
                  </View>
                );
              }
              return null;
            }

            return (
              <View key={section.id} className="gap-3">
                <Text className="text-overline text-text-muted">
                  {section.title.toUpperCase()}
                </Text>
                {section.jobs.map((job) => {
                  const status = presentOrderState(job.state);
                  const when = job.promisedDate || job.deadline;
                  return (
                    <Pressable
                      key={job.id}
                      onPress={() => router.push(`/job/${job.id}`)}
                      accessibilityRole="button"
                      accessibilityLabel={`${job.title}, ${status.label}`}
                      className="gg-card gap-2"
                    >
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="min-w-0 flex-1 gap-1">
                          <Text className="text-body-lg font-medium text-text-primary" numberOfLines={2}>
                            {job.title}
                          </Text>
                          <Text className="text-body text-text-secondary">
                            {formatDeadlineLabel(when)}
                            {formatDeadlineTime(when) ? ` · ${formatDeadlineTime(when)}` : ""}
                          </Text>
                        </View>
                        <StatusChip
                          tone={status.tone}
                          label={status.label}
                          icon={status.icon}
                        />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
