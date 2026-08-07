import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import * as api from "@/lib/api";

export default function JobsScreen() {
  const [jobs, setJobs] = useState<api.Order[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setJobs(await api.listJobs());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function act(id: string, state: string) {
    setBusy(id);
    try {
      await api.transitionOrder(id, state, { note: state === "supplier_accepted" ? "Accepted" : "Declined" });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "action_failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView className="flex-1 bg-canvas px-5 pt-14">
      <Text className="font-satoshi-bold text-2xl text-text-primary">Jobs</Text>
      <Text className="mt-1 font-satoshi text-text-secondary">Accept, produce, self-QC, handoff</Text>
      {error ? <Text className="mt-3 font-satoshi text-error">{error}</Text> : null}
      {jobs.map((job) => (
        <View key={job.id} className="mt-4 rounded-2xl border border-outline bg-surface p-4">
          <Text className="font-satoshi-medium text-text-primary">{job.title}</Text>
          <Text className="mt-1 font-satoshi text-sm text-text-muted">
            {job.size} · {job.material || "—"} · qty {job.quantity}
          </Text>
          <Text className="mt-1 font-satoshi text-sm text-text-secondary">
            {job.state.replaceAll("_", " ")} · {api.formatPhp(job.totalMinor + job.deliveryFeeMinor)}
          </Text>
          {job.state === "supplier_assigned" ? (
            <View className="mt-3 flex-row gap-2">
              <Pressable
                className="flex-1 items-center rounded-xl bg-action-yellow py-3"
                disabled={busy === job.id}
                onPress={() => void act(job.id, "supplier_accepted")}
              >
                <Text className="font-satoshi-medium text-action-yellow-on">Accept</Text>
              </Pressable>
              <Pressable
                className="flex-1 items-center rounded-xl border border-outline py-3"
                disabled={busy === job.id}
                onPress={() => void act(job.id, "approved_for_matching")}
              >
                <Text className="font-satoshi-medium text-text-primary">Decline</Text>
              </Pressable>
            </View>
          ) : null}
          {job.state === "payment_authorized" || job.state === "production" ? (
            <Pressable
              className="mt-3 items-center rounded-xl bg-action-yellow py-3"
              disabled={busy === job.id}
              onPress={() => void act(job.id, job.state === "payment_authorized" ? "production" : "supplier_self_qc")}
            >
              <Text className="font-satoshi-medium text-action-yellow-on">
                {job.state === "payment_authorized" ? "Start production" : "Mark self-QC"}
              </Text>
            </Pressable>
          ) : null}
          {job.state === "supplier_self_qc" ? (
            <Pressable
              className="mt-3 items-center rounded-xl bg-action-yellow py-3"
              disabled={busy === job.id}
              onPress={() => void act(job.id, "ready_for_dispatch")}
            >
              <Text className="font-satoshi-medium text-action-yellow-on">Ready for pickup</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <View className="h-12" />
    </ScrollView>
  );
}
