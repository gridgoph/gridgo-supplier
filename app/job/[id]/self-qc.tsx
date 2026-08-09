import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EvidenceCapture } from "@/components/EvidenceCapture";
import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SelfQcChecklist } from "@/components/SelfQcChecklist";
import { FieldShell } from "@/components/controls/FieldShell";
import { NoteField } from "@/components/controls/NoteField";
import { probeStorage, storedEvidence, type StorageAvailability } from "@/lib/evidence";
import { allSelfQcComplete, findAction, SELF_QC_CHECKS } from "@/lib/jobState";
import { useEvidenceUploads } from "@/hooks/useEvidenceUploads";
import { useJob } from "@/hooks/useJob";
import { useJobAction } from "@/hooks/useJobAction";
import { useJobDraft, useJobDrafts } from "@/store/jobDrafts";

/**
 * Self-QC: the shop's own sign-off that the printed work matches the spec.
 *
 * The checks are the record Operations and the client rely on, so they cannot
 * be part-completed, and photo evidence is only counted once GRIDGO has stored
 * it and returned an id.
 */
export default function SelfQcScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);
  const action = useJobAction();
  const draft = useJobDraft(id);
  const toggleQcCheck = useJobDrafts((s) => s.toggleQcCheck);
  const setNote = useJobDrafts((s) => s.setNote);
  const clearDraft = useJobDrafts((s) => s.clearDraft);

  const [availability, setAvailability] = useState<StorageAvailability>("checking");
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const evidence = useEvidenceUploads(job?.id);

  useEffect(() => {
    let active = true;
    void probeStorage().then((result) => {
      if (active) setAvailability(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const complete = allSelfQcComplete(draft.qcChecks);
  const remaining = SELF_QC_CHECKS.filter((c) => draft.qcChecks[c.id] !== true).length;
  const stored = storedEvidence(evidence.items);
  const step = job ? findAction(job.state, "self_qc") : null;

  function requestConfirm() {
    if (!complete) {
      setShowErrors(true);
      return;
    }
    setConfirming(true);
  }

  async function completeSelfQc() {
    if (!job || !step) return;
    const extra = draft.note.trim();
    const evidenceNote = stored.length
      ? `${stored.length} photo${stored.length === 1 ? "" : "s"} attached`
      : "no photos attached";
    const updated = await action.run({
      jobId: job.id,
      targetState: step.targetState,
      note: extra
        ? `Self-QC passed — ${evidenceNote}. ${extra}`
        : `Self-QC passed — ${evidenceNote}`,
      extra: stored.length ? { attachmentIds: stored.map((e) => e.attachmentId) } : undefined,
    });
    setConfirming(false);
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
            disabled={action.busy || evidence.busy}
            onPress={requestConfirm}
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
        label="Photo evidence"
        hint="Photos are attached to the job once GRIDGO confirms it has stored them."
      >
        <EvidenceCapture
          availability={availability}
          items={evidence.items}
          onTakePhoto={() => void evidence.takePhoto()}
          onPickPhoto={() => void evidence.pickPhoto()}
          onRetry={(key) => void evidence.retry(key)}
          onRemove={evidence.remove}
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

      {job && step ? (
        <ConfirmDialog
          visible={confirming}
          question={`Sign off self-QC for ${job.title}?`}
          consequence={
            stored.length
              ? `Your ${SELF_QC_CHECKS.length} checks and ${stored.length} photo${stored.length === 1 ? "" : "s"} become the job's quality record. The client sees it immediately.`
              : `Your ${SELF_QC_CHECKS.length} checks become the job's quality record, with no photos attached. The client sees it immediately.`
          }
          confirmLabel="Complete self-QC"
          cancelLabel="Keep checking"
          busy={action.busy}
          onConfirm={() => void completeSelfQc()}
          onCancel={() => setConfirming(false)}
        />
      ) : null}

      <View className="gg-panel gap-1">
        <Text className="text-body font-medium text-text-primary">What happens next</Text>
        <Text className="text-body text-text-secondary">
          After sign-off the job waits on you to pack it and mark it ready for pickup. A rider is
          only assigned once you do.
        </Text>
      </View>
    </FlowScreen>
  );
}
