import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { JobTimeline } from "@/components/JobTimeline";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SelfQcChecklist } from "@/components/SelfQcChecklist";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { formatDeadlineFull } from "@/lib/dates";
import * as api from "@/lib/api";
import {
  actionsForJob,
  allSelfQcComplete,
  presentOrderState,
  type SupplierAction,
} from "@/lib/jobState";
import { useThemeColors } from "@/hooks/useTheme";

export default function JobWorkspaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const colors = useThemeColors();

  const [job, setJob] = useState<api.Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [promisedDate, setPromisedDate] = useState("");
  const [finalTotal, setFinalTotal] = useState("");
  const [qcChecked, setQcChecked] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const order = await api.getOrder(id);
      setJob(order);
      setPromisedDate(order.promisedDate || order.deadline || "");
      setFinalTotal(order.totalMinor ? String(order.totalMinor / 100) : "");
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Cannot load this job from ${api.getApiBase()}.`,
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (job) {
      navigation.setOptions({ title: job.title });
    }
  }, [job, navigation]);

  async function runTransition(action: SupplierAction) {
    if (!job) return;

    if (action.kind === "self_qc" && !allSelfQcComplete(qcChecked)) {
      setActionError("Confirm every self-QC check before you continue.");
      return;
    }

    const extra: Record<string, unknown> = {
      note: noteFor(action),
    };
    if (action.kind === "accept") {
      if (promisedDate.trim()) extra.promisedDate = promisedDate.trim();
      const pesos = Number(finalTotal);
      if (finalTotal.trim() && !Number.isNaN(pesos) && pesos > 0) {
        extra.finalTotalMinor = Math.round(pesos * 100);
      }
    }

    setBusy(true);
    setActionError(null);
    try {
      const updated = await api.transitionOrder(job.id, action.targetState, extra);
      setJob(updated);
      if (action.kind === "self_qc") setQcChecked({});
    } catch (e) {
      if (e instanceof api.ApiError) {
        setActionError(humanizeApiError(e));
      } else {
        setActionError(
          e instanceof Error
            ? e.message
            : "The action did not complete. Check your connection and try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function onAction(action: SupplierAction) {
    if (action.destructive) {
      Alert.alert(
        "Decline this job?",
        "Declining returns the job for rematching. Your shop will no longer be assigned.",
        [
          { text: "Keep job", style: "cancel" },
          {
            text: "Decline job",
            style: "destructive",
            onPress: () => void runTransition(action),
          },
        ],
      );
      return;
    }
    void runTransition(action);
  }

  if (loading && !job) {
    return (
      <View className="gg-screen items-center justify-center">
        <ActivityIndicator color={colors.textMuted} />
        <Text className="mt-3 text-body text-text-muted">Opening job…</Text>
      </View>
    );
  }

  if (error || !job) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="Job unavailable"
          body={error || "This job is not on your floor."}
          actionLabel="Try again"
          onAction={() => void reload()}
        />
      </View>
    );
  }

  const status = presentOrderState(job.state);
  const actions = actionsForJob(job.state);
  const primary = actions.find((a) => a.primary) ?? null;
  const secondary = actions.filter((a) => !a.primary);
  const showAcceptFields = job.state === "supplier_assigned";
  const showSelfQc = job.state === "production";

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page gap-6 pb-12 pt-4"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3">
          <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
          <Text className="text-h2 text-text-primary">{job.title}</Text>
          <Text className="text-body text-text-secondary">
            Due {formatDeadlineFull(job.deadline)}
            {job.promisedDate ? ` · Promised ${formatDeadlineFull(job.promisedDate)}` : ""}
          </Text>
        </View>

        <View className="gg-card">
          <Text className="mb-1 text-overline text-text-muted">SPEC</Text>
          <SpecRow label="Size" value={job.size || "—"} />
          <SpecRow label="Material" value={job.material || "—"} />
          <SpecRow label="Quantity" value={String(job.quantity)} />
          <SpecRow label="Artwork" value={job.artworkName || "Not attached"} />
          <SpecRow label="Print total" value={api.formatPhp(job.totalMinor)} />
          <SpecRow label="Delivery fee" value={api.formatPhp(job.deliveryFeeMinor)} />
          <SpecRow label="Deliver to" value={job.address || "—"} />
        </View>

        {showAcceptFields ? (
          <View className="gg-card gap-3">
            <Text className="text-overline text-text-muted">ACCEPT DETAILS</Text>
            <Text className="text-body text-text-secondary">
              Optional: set the promised finish time and a final print total before
              the client pays. Leave blank to keep the current values.
            </Text>
            <View className="gap-1">
              <Text className="text-caption text-text-muted">Promised date (ISO)</Text>
              <TextInput
                value={promisedDate}
                onChangeText={setPromisedDate}
                autoCapitalize="none"
                className="gg-field"
                placeholder="2026-08-12T17:00:00+08:00"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View className="gap-1">
              <Text className="text-caption text-text-muted">Final print total (₱)</Text>
              <TextInput
                value={finalTotal}
                onChangeText={setFinalTotal}
                keyboardType="decimal-pad"
                className="gg-field"
                placeholder="1200.00"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>
        ) : null}

        {showSelfQc ? (
          <View className="gg-card gap-3">
            <Text className="text-overline text-text-muted">SELF-QC</Text>
            <SelfQcChecklist
              checked={qcChecked}
              onToggle={(checkId) =>
                setQcChecked((prev) => ({ ...prev, [checkId]: !prev[checkId] }))
              }
            />
          </View>
        ) : null}

        <View className="gg-card gap-3">
          <Text className="text-overline text-text-muted">TIMELINE</Text>
          <JobTimeline timeline={job.timeline} />
        </View>

        {actionError ? (
          <Text className="text-body text-error">{actionError}</Text>
        ) : null}

        {primary || secondary.length ? (
          <View className="gap-3">
            {primary ? (
              <PrimaryButton
                label={busy ? "Working…" : primary.label}
                disabled={busy}
                onPress={() => onAction(primary)}
              />
            ) : null}
            {secondary.map((action) => (
              <SecondaryButton
                key={action.kind}
                label={action.label}
                disabled={busy}
                onPress={() => onAction(action)}
              />
            ))}
          </View>
        ) : (
          <View className="gg-panel">
            <Text className="text-body text-text-secondary">
              No supplier action on this job right now. Watch the timeline for the
              next update from the client, rider, or Operations.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function noteFor(action: SupplierAction): string {
  switch (action.kind) {
    case "accept":
      return "Accepted by supplier";
    case "decline":
      return "Declined — return for rematch";
    case "request_payment":
      return "Ready for client payment";
    case "start_production":
      return "Production started";
    case "self_qc":
      return "Self-QC passed";
    case "ready_for_pickup":
      return "Ready for rider pickup";
  }
}

function humanizeApiError(e: api.ApiError): string {
  const body = e.body;
  const code =
    typeof body === "object" && body && "error" in body
      ? String((body as { error: string }).error)
      : e.message;

  if (code === "transition_not_allowed") {
    return "That step is not available for this job in its current state. Refresh and try the action shown.";
  }
  if (code === "order_not_found") {
    return "This job is no longer on your floor. It may have been rematched.";
  }
  return e.message || "The action did not complete. Try again.";
}
