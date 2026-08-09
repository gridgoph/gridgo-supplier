import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Circle, CircleCheck } from "lucide-react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { FieldShell } from "@/components/controls/FieldShell";
import {
  allHandoffChecksDone,
  custodyForOrder,
  HANDOFF_CHECKS,
  handoffChecksRemaining,
} from "@/lib/handoff";
import { findAction } from "@/lib/jobState";
import { useJob } from "@/hooks/useJob";
import { useJobAction } from "@/hooks/useJobAction";
import { useJobDraft, useJobDrafts } from "@/store/jobDrafts";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The custody moment.
 *
 * This is where a physical job is actually lost, so the screen never leaves the
 * state ambiguous: it says who is holding the job right now, who moves next,
 * and what the rider will do. The shop can only take it as far as ready for
 * pickup — the rider's own confirmation is what transfers custody.
 */
export default function HandoffScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);
  const action = useJobAction();
  const draft = useJobDraft(id);
  const toggleHandoffCheck = useJobDrafts((s) => s.toggleHandoffCheck);
  const clearDraft = useJobDrafts((s) => s.clearDraft);
  const colors = useThemeColors();

  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const custody = job ? custodyForOrder(job) : null;
  const step = job ? findAction(job.state, "ready_for_pickup") : null;
  const ready = allHandoffChecksDone(draft.handoffChecks);
  const remaining = handoffChecksRemaining(draft.handoffChecks);

  function requestConfirm() {
    if (!ready) {
      setShowErrors(true);
      return;
    }
    setConfirming(true);
  }

  async function markReady() {
    if (!job || !step) return;
    const updated = await action.run({
      jobId: job.id,
      targetState: step.targetState,
      note: "Packed, labelled and staged at the counter for rider pickup",
    });
    setConfirming(false);
    if (!updated) return;
    clearDraft(job.id);
  }

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title="Pickup handoff"
      subject={job?.title}
      lede={custody?.detail ?? "Getting a job ready for the rider who collects it."}
      actionError={action.error}
      footer={
        step ? (
          <>
            <PrimaryButton
              label={action.busy ? "Saving…" : "Mark ready for pickup"}
              disabled={action.busy}
              onPress={requestConfirm}
            />
            <SecondaryButton
              label="Not packed yet"
              disabled={action.busy}
              onPress={() => router.back()}
            />
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
          <Text className="text-body text-text-secondary">{custody.detail}</Text>
          <View>
            <SpecRow label="Next move by" value={custody.nextActor} />
            <SpecRow
              label="Collect from"
              value={job.pickup?.label || "Your shop address on file"}
            />
            <SpecRow label="Pieces" value={`${job.quantity}`} />
          </View>
        </View>
      ) : null}

      {step ? (
        <FieldShell
          label="Before you call a rider"
          hint="These stay ticked if you leave and come back."
          error={
            showErrors && !ready
              ? `${remaining} thing${remaining === 1 ? "" : "s"} still to do before a rider is called.`
              : null
          }
        >
          <View className="gap-2">
            {HANDOFF_CHECKS.map((check) => {
              const on = draft.handoffChecks[check.id] === true;
              return (
                <Pressable
                  key={check.id}
                  onPress={() => {
                    if (job) toggleHandoffCheck(job.id, check.id);
                    setShowErrors(false);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={check.label}
                  className="gg-touch flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3 py-3"
                >
                  {on ? (
                    <CircleCheck size={22} color={colors.success} strokeWidth={2} />
                  ) : (
                    <Circle size={22} color={colors.textMuted} strokeWidth={2} />
                  )}
                  <Text
                    className={
                      on
                        ? "flex-1 text-body text-text-primary"
                        : "flex-1 text-body text-text-secondary"
                    }
                  >
                    {check.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </FieldShell>
      ) : null}

      <View className="gg-panel gap-1">
        <Text className="text-body font-medium text-text-primary">
          How custody actually transfers
        </Text>
        <Text className="text-body text-text-secondary">
          The rider confirms the pickup in their own GRIDGO app while they are at your counter. Until
          that confirmation appears on the job timeline, the job is still your responsibility — do
          not let it leave without it.
        </Text>
      </View>

      {job && step ? (
        <ConfirmDialog
          visible={confirming}
          question={`Call a rider for ${job.title}?`}
          consequence="GRIDGO starts assigning a rider now, so the job must already be packed and staged at your counter."
          confirmLabel="Mark ready for pickup"
          cancelLabel="Not packed yet"
          busy={action.busy}
          onConfirm={() => void markReady()}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </FlowScreen>
  );
}
