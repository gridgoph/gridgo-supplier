import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DangerButton } from "@/components/DangerButton";
import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { NoteField } from "@/components/controls/NoteField";
import { OptionList } from "@/components/controls/OptionList";
import {
  DECLINE_REASONS,
  declineTimelineNote,
  type DeclineReasonId,
} from "@/lib/decline";
import { findAction } from "@/lib/jobState";
import { useJob } from "@/hooks/useJob";
import { useJobAction } from "@/hooks/useJobAction";

/**
 * Declining cannot be undone by the shop, so it asks for a reason, states the
 * consequence twice, and confirms with the job named. Nothing on this screen is
 * yellow — the reward colour does not belong on a step the shop loses work by
 * taking.
 */
export default function DeclineJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);
  const action = useJobAction();

  const [reason, setReason] = useState<DeclineReasonId | null>(null);
  const [detail, setDetail] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [declined, setDeclined] = useState(false);

  function requestConfirm() {
    if (!reason) {
      setShowErrors(true);
      return;
    }
    setConfirming(true);
  }

  async function decline() {
    if (!job || !reason) return;
    const step = findAction(job.state, "decline");
    const updated = await action.run({
      jobId: job.id,
      targetState: step?.targetState ?? "approved_for_matching",
      note: declineTimelineNote(reason, detail),
    });
    setConfirming(false);
    if (!updated) return;
    // GRIDGO removes the job from this shop the moment it is declined, so the
    // workspace behind this screen no longer has anything to show. The outcome
    // is stated here instead, and the only way on is back to the job list.
    setDeclined(true);
  }

  if (declined) {
    return (
      <FlowScreen
        loading={false}
        error={null}
        onRetry={() => void reload()}
        title="Declined"
        subject={job?.title}
        lede="GRIDGO has the job back and is matching it to another accredited shop."
        footer={
          <PrimaryButton
            label="Back to jobs"
            onPress={() => router.navigate("/(tabs)/jobs")}
          />
        }
      >
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">
            Your reason went with it
          </Text>
          <Text className="text-body text-text-secondary">
            Operations and the client can read why on the job timeline. Nothing else about your
            shop changed.
          </Text>
        </View>
      </FlowScreen>
    );
  }

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title="Decline this job"
      subject={job?.title}
      lede="The job returns to GRIDGO for rematching to another shop. It will not be offered to you again."
      actionError={action.error}
      footer={
        <>
          <DangerButton
            label={action.busy ? "Declining…" : "Decline job"}
            disabled={action.busy}
            onPress={requestConfirm}
          />
          <SecondaryButton
            label="Keep this job"
            disabled={action.busy}
            onPress={() => router.back()}
          />
        </>
      }
    >
      <FieldShell
        label="Why are you declining?"
        hint="Operations and the client see this on the job's timeline."
        error={showErrors && !reason ? "Pick the reason that fits closest." : null}
      >
        <OptionList
          options={DECLINE_REASONS.map((r) => ({ value: r.id, label: r.label }))}
          value={reason}
          onChange={(value) => {
            setReason(value);
            setShowErrors(false);
          }}
          accessibilityLabel="Reason for declining"
        />
      </FieldShell>

      <FieldShell
        label="Anything Operations should know (optional)"
        hint="Your own words — for example, which press is down or when you free up."
      >
        <NoteField
          value={detail}
          onChange={setDetail}
          placeholder="Large-format press is down until Thursday."
          accessibilityLabel="Extra detail for Operations"
        />
      </FieldShell>

      <View className="gg-panel gap-1">
        <Text className="text-body font-medium text-text-primary">
          What happens after you decline
        </Text>
        <Text className="text-body text-text-secondary">
          GRIDGO matches the job to another accredited shop. Your capacity and payout are not
          affected, and no penalty is applied in the pilot.
        </Text>
      </View>

      <ConfirmDialog
        visible={confirming}
        question={`Decline ${job?.title ?? "this job"}?`}
        consequence="It goes back to GRIDGO for rematching now, and your shop will not be offered it again."
        confirmLabel="Decline job"
        cancelLabel="Keep this job"
        destructive
        busy={action.busy}
        onConfirm={() => void decline()}
        onCancel={() => setConfirming(false)}
      />
    </FlowScreen>
  );
}
