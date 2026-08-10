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
 * Accepting is a commitment, so it is never a row tap: the shop names its own
 * price and when it will finish, and sees both against the client's deadline
 * before it commits.
 *
 * The price is the shop's, not the client's. GRIDGO adds its own charge on top
 * to reach what the client pays, and that figure is never sent to this app —
 * so nothing here may present the shop's price as the client's total. Naming a
 * price is what tells the client what to pay, so it is required, not optional.
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
  const moneyError = money.ok
    ? money.minor == null
      ? "Name your price for this job — the client is told it the moment you accept."
      : null
    : money.error;

  const deadline = job?.deadline ? new Date(job.deadline) : null;
  const lateAgainstDeadline =
    promisedAt != null && deadline != null && promisedAt.getTime() > deadline.getTime();
  const closure = promisedAt ? blackoutOnDay(blackouts, toDayKey(promisedAt)) : null;

  const missingPromise = promisedAt == null;
  const priceMinor = money.ok ? money.minor : null;

  // The action stays pressable while the form is incomplete: a dead yellow
  // button teaches nothing, whereas pressing it names the field that is missing.
  async function submit() {
    if (!job || !promisedAt || priceMinor == null) {
      setShowErrors(true);
      return;
    }
    const commitment = findAction(job, "accept");

    const updated = await action.run({
      jobId: job.id,
      targetState: commitment?.targetState ?? "supplier_accepted",
      note: `Accepted at ${api.formatPhp(priceMinor)} — promised ${formatDeadlineFull(promisedAt.toISOString())}`,
      extra: {
        promisedDate: promisedAt.toISOString(),
        supplierPriceMinor: priceMinor,
      },
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
      lede="Your shop commits to producing this job at the price you name, by the finish time you promise. GRIDGO tells the client both straight away and asks them to pay."
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
          </View>

          <FieldShell
            label="Your price for this job"
            hint="What your shop is paid, in pesos. GRIDGO adds its own charge and the delivery fee on top to reach what the client pays — neither comes out of this."
            error={showErrors ? moneyError : null}
          >
            <MoneyField
              value={draft.accept.finalTotal}
              onChange={(value) => setAccept(job.id, { finalTotal: value })}
              accessibilityLabel="Your price for this job in pesos"
            />
          </FieldShell>

          {priceMinor != null ? (
            <View className="gg-panel gap-2">
              <Text className="text-body font-medium text-text-primary">
                How {api.formatPhp(priceMinor)} reaches you
              </Text>
              <Text className="text-body text-text-secondary">
                GRIDGO pays it in four parts as the job moves — printing, packing and quality
                check, delivery, and a retention part that lands once the client&apos;s window to
                report a problem closes. Each part needs evidence before it is released, and you
                file the first two here. You will see what each is worth on the job as soon as
                you accept.
              </Text>
            </View>
          ) : null}

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

        </>
      ) : null}
    </FlowScreen>
  );
}
