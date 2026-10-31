import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

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
 * the client should know, and takes the step. The note is what lands on the
 * client's order timeline — a status word on its own tells them nothing.
 *
 * This is a short, reversible step over a job the shop is already looking at,
 * so it is presented as a sheet rather than pushed as a place: the job stays
 * behind it and the sheet drags away. The consequence is said once, directly
 * above the action, as the exact note the client will read — which is why
 * there is no second confirmation on top of it, and no lede or hint repeating
 * it: asking the same question twice teaches a shop to stop reading either time.
 */
export default function AdvanceJobScreen() {
  const { id, action: actionKind } = useLocalSearchParams<{ id: string; action?: string }>();
  const { job, loading, error, reload } = useJob(id);
  const action = useJobAction();
  const draft = useJobDraft(id);
  const setNote = useJobDrafts((s) => s.setNote);
  const clearDraft = useJobDrafts((s) => s.clearDraft);

  const step = job ? findAction(job, actionKind ?? "") : null;
  const templates = templatesForAction(step?.kind);
  const [chosen, setChosen] = useState<ProductionTemplateId | null>(null);

  // The job arrives after the first render, so the choice is derived rather
  // than seeded — otherwise the control would open on a template that is not in
  // its own list.
  const templateId =
    chosen && templates.some((t) => t.id === chosen) ? chosen : (templates[0]?.id ?? null);
  const template = PRODUCTION_UPDATE_TEMPLATES.find((t) => t.id === templateId);
  const status = job ? presentOrderState(job.state, job) : null;
  // The note exactly as it is sent: the preview above the action reads this too.
  const headline = template?.timelineNote ?? step?.resultLabel ?? "";
  const extra = draft.note.trim();
  const timelineNote = extra ? `${headline}. ${extra}` : headline;

  // A second tap before the first one re-renders the button disabled sends nothing.
  const pending = useRef(false);

  async function advance() {
    // A step with no target state is not a transition at all (a proof is sent
    // by attaching a file), so it never reaches this screen.
    if (!job || !step?.targetState || pending.current) return;
    pending.current = true;
    try {
      const updated = await action.run({
        jobId: job.id,
        targetState: step.targetState,
        note: timelineNote,
      });
      if (!updated) return;
      clearDraft(job.id);
      router.back();
    } finally {
      pending.current = false;
    }
  }

  const unavailable = Boolean(job) && !step;

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title={step?.label ?? "Production update"}
      subject={job?.title}
      lede={step ? undefined : "This job has already moved on, so there is nothing to update from here."}
      actionError={action.error}
      footer={
        unavailable ? (
          <PrimaryButton label="Back to job" onPress={() => router.back()} />
        ) : (
          <>
            <PrimaryButton
              label={action.busy ? "Saving…" : (step?.label ?? "Save update")}
              disabled={action.busy || !step}
              onPress={() => void advance()}
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
        </View>
      ) : null}

      {step && templates.length > 1 && templateId ? (
        <FieldShell label="What happened">
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

      {step ? (
        <View className="gg-panel gap-1" testID="timeline-preview">
          <Text className="text-caption text-text-muted">
            The client&apos;s order shows this straight away. The job then reads {step.resultLabel}.
          </Text>
          <Text className="text-body text-text-primary">“{timelineNote}”</Text>
        </View>
      ) : null}
    </FlowScreen>
  );
}
