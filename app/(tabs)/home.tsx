import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { GridgoLogo } from "@/components/GridgoLogo";
import * as api from "@/lib/api";
import { useSession } from "@/store/session";

export default function HomeScreen() {
  const { user } = useSession();
  const [jobs, setJobs] = useState<api.Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const list = await api.listJobs();
          if (alive) setJobs(list);
        } catch (e) {
          if (alive) setError(e instanceof Error ? e.message : "load_failed");
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const pending = jobs.filter((j) => j.state === "supplier_assigned").length;
  const active = jobs.filter((j) =>
    ["supplier_accepted", "awaiting_payment", "payment_authorized", "production", "supplier_self_qc"].includes(j.state),
  ).length;

  return (
    <View className="flex-1 bg-canvas px-5 pt-14">
      <GridgoLogo />
      <Text className="mt-4 font-satoshi-bold text-2xl text-text-primary">
        {user?.supplierName || "Supplier"}
      </Text>
      <Text className="mt-1 font-satoshi text-text-secondary">Time-sensitive production actions</Text>

      <View className="mt-6 flex-row gap-3">
        <View className="flex-1 rounded-2xl border border-outline bg-surface p-4">
          <Text className="font-satoshi text-text-muted">Awaiting accept</Text>
          <Text className="mt-1 font-satoshi-bold text-3xl text-text-primary">{pending}</Text>
        </View>
        <View className="flex-1 rounded-2xl border border-outline bg-surface p-4">
          <Text className="font-satoshi text-text-muted">In production</Text>
          <Text className="mt-1 font-satoshi-bold text-3xl text-text-primary">{active}</Text>
        </View>
      </View>

      {error ? <Text className="mt-4 font-satoshi text-error">{error}</Text> : null}

      <Text className="mt-8 font-satoshi-medium text-text-primary">Today</Text>
      {jobs.slice(0, 3).map((job) => (
        <View key={job.id} className="mt-3 rounded-2xl border border-outline bg-surface p-4">
          <Text className="font-satoshi-medium text-text-primary">{job.title}</Text>
          <Text className="mt-1 font-satoshi text-sm text-text-muted">
            {job.state.replaceAll("_", " ")} · {api.formatPhp(job.totalMinor)}
          </Text>
        </View>
      ))}
      {!jobs.length && !error ? (
        <Text className="mt-3 font-satoshi text-text-muted">No jobs yet — check back after Operations matches work.</Text>
      ) : null}
    </View>
  );
}
