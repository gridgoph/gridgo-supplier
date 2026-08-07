import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import * as api from "@/lib/api";

export default function ScheduleScreen() {
  const [jobs, setJobs] = useState<api.Order[]>([]);

  useFocusEffect(
    useCallback(() => {
      void api.listJobs().then(setJobs).catch(() => setJobs([]));
    }, []),
  );

  const upcoming = [...jobs]
    .filter((j) => j.promisedDate || j.deadline)
    .sort((a, b) => String(a.promisedDate || a.deadline).localeCompare(String(b.promisedDate || b.deadline)));

  return (
    <ScrollView className="flex-1 bg-canvas px-5 pt-14">
      <Text className="font-satoshi-bold text-2xl text-text-primary">Schedule</Text>
      <Text className="mt-1 font-satoshi text-text-secondary">Today / next 7 days (Asia/Manila)</Text>
      {upcoming.map((job) => (
        <View key={job.id} className="mt-4 rounded-2xl border border-outline bg-surface p-4">
          <Text className="font-satoshi-medium text-text-primary">{job.title}</Text>
          <Text className="mt-1 font-satoshi text-sm text-text-muted">
            Promised {job.promisedDate || job.deadline || "—"}
          </Text>
          <Text className="mt-1 font-satoshi text-sm text-text-secondary">{job.state.replaceAll("_", " ")}</Text>
        </View>
      ))}
      {!upcoming.length ? (
        <Text className="mt-6 font-satoshi text-text-muted">No dated jobs yet.</Text>
      ) : null}
    </ScrollView>
  );
}
