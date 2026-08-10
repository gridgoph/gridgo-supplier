import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { DateTimeField } from "@/components/controls/DateTimeField";
import { FieldShell } from "@/components/controls/FieldShell";
import { MoneyField } from "@/components/controls/MoneyField";
import * as api from "@/lib/api";
import { blackoutOnDay, blackoutReasonLabel } from "@/lib/blackouts";
import { toDayKey } from "@/lib/day";
import { formatDeadlineFull } from "@/lib/dates";
import { findAction } from "@/lib/jobState";
import { parseMoney } from "@/lib/money";
import { useJob } from "@/hooks/useJob";
import { useJobAction } from "@/hooks/useJobAction";
import { useJobDraft, useJobDrafts } from "@/store/jobDrafts";
import { useShopPlan } from "@/store/shopPlan";

/**
 * Accepting is a commitment, so it is never a row tap: the shop states when it
 * will finish and what the client pays, and sees both against the client's own
 * deadline before the yellow action is available.
 */
export default function AcceptJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);
  const action = useJobAction();
  const draft = useJobDraft(id);
  const setAccept = useJobDrafts((s) => s.setAccept);
  const clearDraft = useJobDrafts((s) => s.clearDraft);
  const blackouts = useShopPlan((s) => s.blackouts);
  const [showErrors, setShowErrors] = useState(false);

  const promisedAt = useMemo(() => {
    if (draft.accept.promisedAt) {
      const parsed = new Date(draft.accept.promisedAt);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const fallback = job?.deadline;
    return fallback && !Number.isNaN(new Date(fallback).getTime())
      ? new Date(fallback)
      : null;
  }, [draft.accept.promisedAt, job?.deadline]);

  const money = parseMoney(draft.accept.finalTotal);
  const moneyError = money.ok ? null : money.error;

  const deadline = job?.deadline ? new Date(job.deadline) : null;
  const lateAgainstDeadline =
    promisedAt != null && deadline != null && promisedAt.getTime() > deadline.getTime();
  const closure = promisedAt ? blackoutOnDay(blackouts, toDayKey(promisedAt)) : null;

  const missingPromise = promisedAt == null;

  // The action stays pressable while the form is incomplete: a dead yellow
  // button teaches nothing, whereas pressing it names the field that is missing.
  async function submit() {
    if (!job || !promisedAt || !money.ok) {
      setShowErrors(true);
      return;
    }
    const commitment = findAction(job.state, "accept");
    const extra: Record<string, unknown> = { promisedDate: promisedAt.toISOString() };
    if (money.minor != null) extra.finalTotalMinor = money.minor;

    const updated = await action.run({
      jobId: job.id,
      targetState: commitment?.targetState ?? "supplier_accepted",
      note: `Accepted — promised ${formatDeadlineFull(promisedAt.toISOString())}`,
      extra,
    });
    if (!updated) return;
    clearDraft(job.id);
    router.back();
  }

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title="Accept this job"
      subject={job?.title}
      lede="Your shop commits to producing this job by the finish time you promise. The client sees that time straight away."
      actionError={action.error}
      footer={
        <>
          <PrimaryButton
            label={action.busy ? "Accepting…" : "Accept job"}
            disabled={action.busy}
            onPress={() => void submit()}
          />
          <SecondaryButton
            label="Not now"
            disabled={action.busy}
            onPress={() => router.back()}
          />
        </>
      }
    >
      {job ? (
        <>
          <View className="gg-card">
            <Text className="mb-2 text-overline text-text-muted">WHAT WAS ORDERED</Text>
            <SpecRow label="Size" value={job.size || "—"} />
            <SpecRow label="Material" value={job.material || "—"} />
            <SpecRow label="Quantity" value={`${job.quantity}`} />
            <SpecRow label="Client needs it by" value={formatDeadlineFull(job.deadline)} />
            <SpecRow label="Quoted print total" value={api.formatPhp(job.totalMinor)} />
          </View>

          <FieldShell
            label="Promised finish"
            hint="Pick the time the job will be packed and ready for a rider."
            error={showErrors && missingPromise ? "Choose a promised finish time." : null}
          >
            <DateTimeField
              value={promisedAt}
              onChange={(next) => setAccept(job.id, { promisedAt: next.toISOString() })}
              minimumDate={new Date()}
              accessibilityLabel="Promised finish"
              placeholder="Choose a finish date and time"
            />
          </FieldShell>

          {lateAgainstDeadline ? (
            <View className="rounded-field border border-warning bg-surface p-3">
              <Text className="text-body text-warning">
                This is after the client needs it ({formatDeadlineFull(job.deadline)}). Accepting
                still commits your shop — move the time earlier, or decline if you cannot make it.
              </Text>
            </View>
          ) : null}

          {closure ? (
            <View className="rounded-field border border-warning bg-surface p-3">
              <Text className="text-body text-warning">
                Your shop is marked closed that day ({blackoutReasonLabel(closure.reason)}). Pick a
                day you are open, or remove that closure in Capacity & closures.
              </Text>
            </View>
          ) : null}

          <FieldShell
            label="Final print total"
            hint="Leave blank to accept the quoted total. Delivery is charged separately and is not shop revenue."
            error={showErrors ? moneyError : null}
          >
            <MoneyField
              value={draft.accept.finalTotal}
              onChange={(value) => setAccept(job.id, { finalTotal: value })}
              accessibilityLabel="Final print total in pesos"
            />
          </FieldShell>
        </>
      ) : null}
    </FlowScreen>
  );
}
