import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { FieldShell } from "@/components/controls/FieldShell";
import { NoteField } from "@/components/controls/NoteField";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import {
  PRODUCTION_UPDATE_TEMPLATES,
  templatesForAction,
  type ProductionTemplateId,
} from "@/lib/productionUpdates";
import { findAction, presentOrderState } from "@/lib/jobState";
import { useJob } from "@/hooks/useJob";
import { useJobAction } from "@/hooks/useJobAction";
import { useJobDraft, useJobDrafts } from "@/store/jobDrafts";

/**
 * One production step, taken deliberately.
 *
 * The shop picks what actually happened from its own vocabulary, adds anything
 * the client should know, and confirms. The note is what lands on the client's
 * order timeline — a status word on its own tells them nothing.
 */
export default function AdvanceJobScreen() {
  const { id, action: actionKind } = useLocalSearchParams<{ id: string; action?: string }>();
  const { job, loading, error, reload } = useJob(id);
  const action = useJobAction();
  const draft = useJobDraft(id);
  const setNote = useJobDrafts((s) => s.setNote);
  const clearDraft = useJobDrafts((s) => s.clearDraft);

  const step = job ? findAction(job.state, actionKind ?? "") : null;
  const templates = templatesForAction(step?.kind);
  const [chosen, setChosen] = useState<ProductionTemplateId | null>(null);
  const [confirming, setConfirming] = useState(false);

  // The job arrives after the first render, so the choice is derived rather
  // than seeded — otherwise the control would open on a template that is not in
  // its own list.
  const templateId =
    chosen && templates.some((t) => t.id === chosen) ? chosen : (templates[0]?.id ?? null);
  const template = PRODUCTION_UPDATE_TEMPLATES.find((t) => t.id === templateId);
  const status = job ? presentOrderState(job.state) : null;

  async function advance() {
    if (!job || !step) return;
    const headline = template?.timelineNote ?? step.resultLabel;
    const extra = draft.note.trim();
    const updated = await action.run({
      jobId: job.id,
      targetState: step.targetState,
      note: extra ? `${headline}. ${extra}` : headline,
    });
    setConfirming(false);
    if (!updated) return;
    clearDraft(job.id);
    router.back();
  }

  const unavailable = Boolean(job) && !step;

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title={step?.label ?? "Production update"}
      subject={job?.title}
      lede={
        step?.consequence ??
        "This job has already moved on, so there is nothing to update from here."
      }
      actionError={action.error}
      footer={
        unavailable ? (
          <PrimaryButton label="Back to job" onPress={() => router.back()} />
        ) : (
          <>
            <PrimaryButton
              label={action.busy ? "Saving…" : (step?.label ?? "Save update")}
              disabled={action.busy || !step}
              onPress={() => setConfirming(true)}
            />
            <SecondaryButton
              label="Not yet"
              disabled={action.busy}
              onPress={() => router.back()}
            />
          </>
        )
      }
    >
      {job && status ? (
        <View className="gg-card gap-3">
          <Text className="text-overline text-text-muted">RIGHT NOW</Text>
          <View className="flex-row">
            <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
          </View>
          {step ? (
            <Text className="text-body text-text-secondary">
              After this step the job reads{" "}
              <Text className="font-medium text-text-primary">{step.resultLabel}</Text> for you, the
              client, and Operations.
            </Text>
          ) : null}
        </View>
      ) : null}

      {step && templates.length > 1 && templateId ? (
        <FieldShell
          label="What happened"
          hint="This is the headline the client reads on their order."
        >
          <SegmentedControl
            options={templates.map((t) => ({ value: t.id, label: t.label }))}
            value={templateId}
            onChange={setChosen}
            accessibilityLabel="Production update"
          />
        </FieldShell>
      ) : null}

      {step ? (
        <FieldShell
          label="Anything else the client should know (optional)"
          hint="Your own words — a colour check, a delay, a collection instruction."
        >
          <NoteField
            value={draft.note}
            onChange={(value) => job && setNote(job.id, value)}
            placeholder="Printing tonight, trimming first thing tomorrow."
            accessibilityLabel="Note for the client"
          />
        </FieldShell>
      ) : null}

      {job && step ? (
        <ConfirmDialog
          visible={confirming}
          question={`${step.label} for ${job.title}?`}
          consequence={`${template?.timelineNote ?? step.resultLabel} appears on the client's order timeline straight away.`}
          confirmLabel={step.label}
          cancelLabel="Not yet"
          busy={action.busy}
          onConfirm={() => void advance()}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </FlowScreen>
  );
}
