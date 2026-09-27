import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { CounterCheckPanel } from "@/components/CounterCheckPanel";
import { FlowScreen } from "@/components/FlowScreen";
import { PackageInvoiceNotice } from "@/components/PackageInvoiceNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { custodyForOrder, HANDOFF_SEQUENCE } from "@/lib/handoff";
import { findAction } from "@/lib/jobState";
import { counterCheck, countTargets } from "@/lib/pickupCheck";
import { useJob } from "@/hooks/useJob";
import { useJobAction } from "@/hooks/useJobAction";
import { useJobDrafts } from "@/store/jobDrafts";
import { askConfirm } from "@/store/sheets";

/**
 * The custody moment.
 *
 * This is where a physical job is actually lost, so the screen never leaves the
 * state ambiguous: it says who is holding the job right now, who moves next,
 * and what the rider will do. Marking the package ready is one signal, not a
 * checklist: it tells riders the job can be collected, and quality and count
 * are checked together with the rider at the counter. The rider's own
 * confirmation is what transfers custody.
 */
export default function HandoffScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);
  const action = useJobAction();
  const clearDraft = useJobDrafts((s) => s.clearDraft);

  const [confirming, setConfirming] = useState(false);
  const pending = useRef(false);
  const busy = confirming || action.busy;

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const custody = job ? custodyForOrder(job) : null;
  // The package is still at the counter until the rider confirms pickup.
  const packing = custody ? custody.state !== "with_rider" && custody.state !== "delivered" : false;
  const step = job ? findAction(job, "ready_for_pickup") : null;
  // What the rider counts, per line, so the shop can count it first.
  const targets = job ? countTargets(job) : [];
  const check = job?.state === "rider_assigned" ? counterCheck(job) : null;
  const counterIssue = check && check.stage !== "passed" ? check : null;

  async function markReady() {
    if (pending.current) return;
    if (!job || !step?.targetState) return;

    pending.current = true;
    setConfirming(true);
    let saved = false;
    try {
      const confirmed = await askConfirm({
        question: `Mark the package ready for ${job.title}?`,
        consequence:
          "Riders will be notified to accept this pickup. Keep the package at the counter and check it together when the rider arrives; all six checks must pass before transport.",
        confirmLabel: "Mark package ready",
        cancelLabel: "Not yet",
      });
      if (!confirmed) return;

      const updated = await action.run({
        jobId: job.id,
        targetState: step.targetState,
        note: "Packaging ready — packed and staged for the joint pickup checks with the rider",
      });
      if (!updated) return;
      saved = true;
      clearDraft(job.id);
      router.replace({ pathname: "/job/[id]", params: { id: job.id } });
    } finally {
      // A successful dispatch stays locked until navigation unmounts this form.
      if (!saved) pending.current = false;
      setConfirming(false);
    }
  }

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title="Package for pickup"
      subject={job?.title}
      // A stopped pickup is explained once, in its own panel below.
      lede={
        counterIssue
          ? "The package stays at your counter until the rider checks it again."
          : custody?.detail ?? "Getting a job ready for the rider who collects it."
      }
      actionError={action.error}
      footer={
        step ? (
          <>
            <PrimaryButton
              label={action.busy ? "Notifying riders…" : "Mark package ready"}
              disabled={busy}
              onPress={() => void markReady()}
            />
            <SecondaryButton label="Back to job" disabled={busy} onPress={() => router.back()} />
          </>
        ) : (
          <SecondaryButton label="Back to job" onPress={() => router.back()} />
        )
      }
    >
      {job && custody ? (
        <View className="gg-card gap-3">
          <Text className="text-overline text-text-muted">CUSTODY</Text>
          <View className="flex-row">
            <StatusChip tone={custody.tone} label={custody.label} icon={custody.icon} />
          </View>
          {counterIssue ? null : (
            <Text className="text-body text-text-secondary">{custody.detail}</Text>
          )}
          <View>
            <SpecRow label="Next move by" value={custody.nextActor} />
            <SpecRow
              label="Collect from"
              value={job.pickup?.label || "Your shop address on file"}
            />
            {targets.length === 1 ? (
              <SpecRow label="Pieces the rider counts" value={targets[0].expected.toLocaleString("en-PH")} />
            ) : targets.length > 1 ? (
              targets.map((target) => (
                <SpecRow
                  key={target.key}
                  label={target.name}
                  value={`${target.expected.toLocaleString("en-PH")} pieces`}
                />
              ))
            ) : (
              <SpecRow label="Pieces" value={`${job.quantity}`} />
            )}
          </View>
        </View>
      ) : null}

      {counterIssue ? (
        <CounterCheckPanel
          check={counterIssue}
          onMessageOperations={() =>
            router.push({ pathname: "/report", params: { orderId: job!.id, title: job!.title } })
          }
        />
      ) : null}

      {packing ? <PackageInvoiceNotice /> : null}

      <HandoffSequence />
    </FlowScreen>
  );
}

/**
 * What marking the package ready sets in motion, in the order it happens.
 * Numbered because it is a sequence, and monochrome because the one yellow on
 * this screen is the button that starts it.
 */
function HandoffSequence() {
  return (
    <View className="gg-panel gap-4" accessibilityRole="list">
      <Text className="text-overline text-text-muted">WHAT HAPPENS NEXT</Text>
      {HANDOFF_SEQUENCE.map((step, index) => {
        const last = index === HANDOFF_SEQUENCE.length - 1;
        return (
          <View key={step.id} className="flex-row gap-3">
            <View className="items-center">
              <View className="h-6 w-6 items-center justify-center rounded-pill bg-accent">
                <Text maxFontSizeMultiplier={1.2} className="text-caption font-medium text-accent-on">
                  {index + 1}
                </Text>
              </View>
              {last ? null : <View className="mt-1 w-px flex-1 bg-outline" />}
            </View>
            <View className={last ? "flex-1 gap-1" : "flex-1 gap-1 pb-3"}>
              <Text className="text-body font-medium text-text-primary">{step.title}</Text>
              <Text className="text-body text-text-secondary">{step.detail}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
