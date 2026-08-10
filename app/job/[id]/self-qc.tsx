import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SelfQcChecklist } from "@/components/SelfQcChecklist";
import { FieldShell } from "@/components/controls/FieldShell";
import { NoteField } from "@/components/controls/NoteField";
import { allSelfQcComplete, findAction, SELF_QC_CHECKS } from "@/lib/jobState";
import { useJob } from "@/hooks/useJob";
import { useJobAction } from "@/hooks/useJobAction";
import { useJobDraft, useJobDrafts } from "@/store/jobDrafts";
import { askConfirm } from "@/store/sheets";

/**
 * Self-QC: the shop's own sign-off that the printed work matches the spec.
 *
 * The checks are the record Operations and the client rely on, so they cannot
 * be part-completed. Photographs of the work are a separate thing and belong on
 * their own screen: each one backs a named part of the shop's payout, so it is
 * filed against a milestone rather than dropped in beside a checklist.
 */
export default function SelfQcScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);
  const action = useJobAction();
  const draft = useJobDraft(id);
  const toggleQcCheck = useJobDrafts((s) => s.toggleQcCheck);
  const setNote = useJobDrafts((s) => s.setNote);
  const clearDraft = useJobDrafts((s) => s.clearDraft);

  const [showErrors, setShowErrors] = useState(false);

  const complete = allSelfQcComplete(draft.qcChecks);
  const remaining = SELF_QC_CHECKS.filter((c) => draft.qcChecks[c.id] !== true).length;
  const step = job ? findAction(job, "self_qc") : null;

  async function completeSelfQc() {
    if (!complete) {
      setShowErrors(true);
      return;
    }
    if (!job || !step?.targetState) return;

    const confirmed = await askConfirm({
      question: `Sign off self-QC for ${job.title}?`,
      consequence: `Your ${SELF_QC_CHECKS.length} checks become this job's quality record, and the client sees it immediately.`,
      confirmLabel: "Complete self-QC",
      cancelLabel: "Keep checking",
    });
    if (!confirmed) return;

    const extra = draft.note.trim();
    const headline = `Self-QC passed — all ${SELF_QC_CHECKS.length} checks confirmed`;
    const updated = await action.run({
      jobId: job.id,
      targetState: step.targetState,
      note: extra ? `${headline}. ${extra}` : headline,
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
      title="Complete self-QC"
      subject={job?.title}
      lede="Confirm the printed work matches the approved spec. This is the record Operations and the client rely on before the job leaves your shop."
      actionError={action.error}
      footer={
        <>
          <PrimaryButton
            label={action.busy ? "Saving…" : "Complete self-QC"}
            disabled={action.busy}
            onPress={() => void completeSelfQc()}
          />
          <SecondaryButton
            label="Save and come back"
            disabled={action.busy}
            onPress={() => router.back()}
          />
        </>
      }
    >
      <FieldShell
        label="Checks"
        hint="Every check has to be confirmed. Your ticks are kept if you leave this screen."
        error={
          showErrors && !complete
            ? `${remaining} check${remaining === 1 ? "" : "s"} still to confirm.`
            : null
        }
      >
        <SelfQcChecklist
          checked={draft.qcChecks}
          onToggle={(checkId) => {
            if (job) toggleQcCheck(job.id, checkId);
            setShowErrors(false);
          }}
        />
      </FieldShell>

      <FieldShell
        label="Anything the client should know (optional)"
        hint="For example, a colour that shifted slightly, or how the job is packed."
      >
        <NoteField
          value={draft.note}
          onChange={(value) => job && setNote(job.id, value)}
          placeholder="Colours matched the proof; packed flat in two tubes."
          accessibilityLabel="Note for the client"
        />
      </FieldShell>

      <View className="gg-panel gap-1">
        <Text className="text-body font-medium text-text-primary">What happens next</Text>
        <Text className="text-body text-text-secondary">
          After sign-off the job waits on you to pack it, photograph the packed job as your
          evidence, and mark it ready for pickup. A rider is only assigned once you do.
        </Text>
      </View>
    </FlowScreen>
  );
}
