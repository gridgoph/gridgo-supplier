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
import {
  DECLINE_REASONS,
  declineTimelineNote,
  type DeclineReasonId,
} from "@/lib/decline";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { useJob } from "@/hooks/useJob";
import { askConfirm } from "@/store/sheets";

/**
 * Declining cannot be undone by the shop, so it asks for a reason, states the
 * consequence twice, and confirms with the job named. Nothing on this screen is
 * yellow — the reward colour does not belong on a step the shop loses work by
 * taking.
 */
export default function DeclineJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [reason, setReason] = useState<DeclineReasonId | null>(null);
  const [detail, setDetail] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [declined, setDeclined] = useState(false);

  async function decline() {
    if (!job || !reason) {
      setShowErrors(true);
      return;
    }
    const confirmed = await askConfirm({
      question: `Decline ${job.title}?`,
      consequence:
        "It goes back to GRIDGO now and on your shop's record, and your shop will not be offered it again.",
      confirmLabel: "Decline job",
      cancelLabel: "Keep this job",
      destructive: true,
    });
    if (!confirmed) return;

    setBusy(true);
    setActionError(null);
    try {
      // The reason is required; GRIDGO keeps it on the shop's record.
      await api.declineJob(job.id, declineTimelineNote(reason, detail));
      // The job is GRIDGO's again while the client chooses, so the workspace
      // behind this screen has nothing left for the shop. The outcome is
      // stated here instead, and the way on is back to the job list.
      setDeclined(true);
    } catch (e) {
      setActionError(humanizeApiError(e, offlineMessage("decline this job")));
    } finally {
      setBusy(false);
    }
  }

  if (declined) {
    return (
      <FlowScreen
        loading={false}
        error={null}
        onRetry={() => void reload()}
        title="Declined"
        subject={job?.title}
        lede="GRIDGO has the job back and is offering the client another vetted shop or a full refund."
        footer={
          <>
            <PrimaryButton
              label="Back to jobs"
              onPress={() => router.navigate("/(tabs)/jobs")}
            />
            <SecondaryButton label="See your shop's record" onPress={() => router.push(LATE_PRODUCTION_HREF)} />
          </>
        }
      >
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">
            Your reason went with it
          </Text>
          <Text className="text-body text-text-secondary">
            It is on your shop&apos;s record as passed on, with your reason. No money is taken for
            declining.
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
      lede="The job goes back to GRIDGO, which offers the client another vetted shop or a full refund. It will not be offered to you again."
      actionError={actionError}
      footer={
        <>
          <DangerButton
            label={busy ? "Declining…" : "Decline job"}
            disabled={busy}
            onPress={() => void decline()}
          />
          <SecondaryButton
            label="Keep this job"
            disabled={busy}
            onPress={() => router.back()}
          />
        </>
      }
    >
      <FieldShell
        label="Why are you declining?"
        hint="Operations reads this on your shop's record."
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
          GRIDGO offers the client another vetted shop or a full refund. Your decline goes on your
          shop&apos;s record with your reason, beside your late jobs. No money is taken for it.
        </Text>
      </View>
    </FlowScreen>
  );
}
