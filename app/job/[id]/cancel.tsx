import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { DangerButton } from "@/components/DangerButton";
import { FlowScreen } from "@/components/FlowScreen";
import { LATE_PRODUCTION_HREF } from "@/components/LatenessPanel";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { NoteField } from "@/components/controls/NoteField";
import { OptionList } from "@/components/controls/OptionList";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { hasReleasedShare } from "@/lib/milestones";
import {
  CANCEL_REASONS,
  cancelNeedsDetail,
  cancelReasonText,
  canCancelJob,
  failureStageLabel,
  type CancelReasonId,
} from "@/lib/shopRecovery";
import { useJob } from "@/hooks/useJob";
import { askConfirm } from "@/store/sheets";

/**
 * Giving back a job the shop already accepted.
 *
 * Heavier than declining a new one, and the screen says why before it asks
 * for anything: the job is already counted on, the cancellation goes on the
 * shop's record with the stage it reached, and parts of the shop's earnings
 * not yet released will not be paid. The reason is required — Operations and
 * the record need it — and the step is confirmed with the job named. Nothing
 * here is yellow.
 */
export default function CancelJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);

  const [reason, setReason] = useState<CancelReasonId | null>(null);
  const [detail, setDetail] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const detailMissing = cancelNeedsDetail(reason) && !detail.trim();

  async function cancel() {
    if (!job || !reason || detailMissing) {
      setShowErrors(true);
      return;
    }
    const confirmed = await askConfirm({
      question: `Cancel ${job.title}?`,
      consequence:
        "It goes on your shop's record, and GRIDGO starts finding the client another shop. You cannot take it back.",
      confirmLabel: "Cancel job",
      cancelLabel: "Keep this job",
      destructive: true,
    });
    if (!confirmed) return;

    setBusy(true);
    setActionError(null);
    try {
      await api.cancelJob(job.id, cancelReasonText(reason, detail));
      setCancelled(true);
    } catch (e) {
      setActionError(humanizeApiError(e, offlineMessage("cancel this job")));
    } finally {
      setBusy(false);
    }
  }

  if (cancelled) {
    return (
      <FlowScreen
        loading={false}
        error={null}
        onRetry={() => void reload()}
        title="Cancelled"
        subject={job?.title}
        lede="GRIDGO is offering the client another vetted shop or a full refund. Leave the job as it is."
        footer={
          <>
            <PrimaryButton label="Back to jobs" onPress={() => router.navigate("/(tabs)/jobs")} />
            <SecondaryButton label="See your shop's record" onPress={() => router.push(LATE_PRODUCTION_HREF)} />
          </>
        }
      >
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">It is on your shop&apos;s record</Text>
          <Text className="text-body text-text-secondary">
            With your reason and the stage the job had reached. Operations can see it, and will
            message you if they need anything.
          </Text>
        </View>
      </FlowScreen>
    );
  }

  // Opened on a job that has since moved past where it can be given back.
  const allowed = job ? canCancelJob(job) : true;
  const paidShare = job ? hasReleasedShare(job) : false;

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title="Cancel this job"
      subject={job?.title}
      lede="The job goes back to GRIDGO, which offers the client another vetted shop or a full refund."
      actionError={actionError}
      footer={
        allowed ? (
          <>
            <DangerButton
              label={busy ? "Cancelling…" : "Cancel job"}
              disabled={busy}
              onPress={() => void cancel()}
            />
            <SecondaryButton label="Keep this job" disabled={busy} onPress={() => router.back()} />
          </>
        ) : (
          <SecondaryButton label="Back to the job" onPress={() => router.back()} />
        )
      }
    >
      {job && !allowed ? (
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">This job can no longer be cancelled here</Text>
          <Text className="text-body text-text-secondary">
            It has left your counter, or GRIDGO has already stopped it. If something is wrong, report
            it from the job and Operations will pick it up.
          </Text>
        </View>
      ) : null}

      {job && allowed ? (
        <>
          <View className="gg-card gap-3 border-warning" testID="cancel-warning">
            <Text className="text-body-lg font-medium text-text-primary">
              This counts on your shop&apos;s record
            </Text>
            <Text className="text-body text-text-secondary">
              The client is already counting on this job. GRIDGO records the cancellation with the
              stage it reached — {failureStageLabel(job.state).toLowerCase()} — and Operations sees
              it beside your late jobs.
            </Text>
            <Text className="text-body text-text-secondary">
              Parts of your earnings on this job that have not been released will not be paid. Stop
              work on it once you cancel.
            </Text>
            {paidShare ? (
              <Text className="text-body text-text-secondary">
                Part of this job&apos;s money has already reached you, so Operations decides what
                happens next with the client rather than GRIDGO matching it straight away.
              </Text>
            ) : null}
          </View>

          <FieldShell
            label="Why are you cancelling?"
            hint="Operations reads this on your shop's record."
            error={showErrors && !reason ? "Pick the reason that fits closest." : null}
          >
            <OptionList
              options={CANCEL_REASONS.map((r) => ({ value: r.id, label: r.label }))}
              value={reason}
              onChange={(value) => {
                setReason(value);
                setShowErrors(false);
              }}
              accessibilityLabel="Reason for cancelling"
            />
          </FieldShell>

          <FieldShell
            label={cancelNeedsDetail(reason) ? "What happened" : "Anything Operations should know (optional)"}
            hint="Your own words — for example, which machine is down and until when."
            error={showErrors && detailMissing ? "Say what happened, in a sentence." : null}
          >
            <NoteField
              value={detail}
              onChange={setDetail}
              placeholder="The laminator is down until Thursday."
              accessibilityLabel="What happened, for Operations"
            />
          </FieldShell>
        </>
      ) : null}
    </FlowScreen>
  );
}
