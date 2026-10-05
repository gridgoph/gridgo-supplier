import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { DateTimeField } from "@/components/controls/DateTimeField";
import { FieldShell } from "@/components/controls/FieldShell";
import { NoteField } from "@/components/controls/NoteField";
import * as api from "@/lib/api";
import { humanizeApiError, isRouteNotOpen, offlineMessage } from "@/lib/apiErrors";
import { formatDeadlineFull } from "@/lib/dates";
import {
  canRequestNewDeadline,
  proposedDeadlineError,
  reasonError,
  RESCHEDULE_REASON_MAX,
} from "@/lib/reschedule";
import { useJob } from "@/hooks/useJob";
import { askConfirm } from "@/store/sheets";

/** What follows a request, in the order it can happen. */
const WHAT_HAPPENS = [
  "The client has 24 hours to answer. Keep working to your current ready-by until they do.",
  "If they agree, the new ready-by replaces the old one, and late production is measured against it.",
  "If they decline, pause work while GRIDGO offers them another shop or a refund.",
  "If they do not answer, your current ready-by stands and Operations follows up.",
] as const;

/**
 * Asking the client for more time on a job in production.
 *
 * Once per job, so the screen says so before anything else and confirms
 * before sending. The current ready-by is stated, not editable, so the shop
 * picks the new one against it; the reason is required because the client
 * reads it when they decide.
 */
export default function RequestDeadlineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);

  const [proposed, setProposed] = useState<Date | null>(null);
  const [reason, setReason] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const dateProblem = proposedDeadlineError(proposed, job?.readyBy);
  const reasonProblem = reasonError(reason);
  const allowed = job ? canRequestNewDeadline(job) : true;

  // Later than both now and the ready-by the job already has, so any pick is one GRIDGO takes.
  const readyByMs = job?.readyBy ? Date.parse(job.readyBy) : Number.NaN;
  const earliest = new Date(Math.max(Date.now(), Number.isNaN(readyByMs) ? 0 : readyByMs) + 60_000);

  async function send() {
    if (!job || !proposed || dateProblem || reasonProblem) {
      setShowErrors(true);
      return;
    }
    const confirmed = await askConfirm({
      question: `Ask the client to move the ready-by to ${formatDeadlineFull(proposed.toISOString())}?`,
      consequence:
        "You can ask only once on this job, and the request stays on your shop's record whatever the answer.",
      confirmLabel: "Send request",
      cancelLabel: "Not yet",
    });
    if (!confirmed) return;

    setBusy(true);
    setActionError(null);
    try {
      await api.requestNewDeadline(job.id, {
        reason: reason.trim(),
        proposedReadyBy: proposed.toISOString(),
      });
      router.back();
    } catch (e) {
      setActionError(
        isRouteNotOpen(e)
          ? "GRIDGO is not taking deadline requests on this connection yet. Report a problem from the job and Operations will review the date with you."
          : humanizeApiError(e, offlineMessage("send this request")),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title="Request a new deadline"
      subject={job?.title}
      lede="Ask the client for a later ready-by. You can ask once on this job, and nothing changes until the client agrees."
      actionError={actionError}
      footer={
        allowed ? (
          <>
            <PrimaryButton
              label={busy ? "Sending…" : "Send request"}
              disabled={busy}
              onPress={() => void send()}
            />
            <SecondaryButton label="Not now" disabled={busy} onPress={() => router.back()} />
          </>
        ) : (
          <SecondaryButton label="Back to the job" onPress={() => router.back()} />
        )
      }
    >
      {job && !allowed ? (
        <View className="gg-panel gap-1">
          <Text className="text-body font-medium text-text-primary">This job cannot take a request now</Text>
          <Text className="text-body text-text-secondary">
            {job.rescheduleRequest
              ? "This job already has its one deadline request. Where it stands is on the job."
              : "A new deadline can be asked for while a job is in production, before it is marked ready."}
          </Text>
        </View>
      ) : null}

      {job && allowed ? (
        <>
          <View className="gg-card gap-1">
            <Text className="text-caption text-text-muted">Your ready-by now</Text>
            <Text className="text-h3 text-text-primary">{formatDeadlineFull(job.readyBy)}</Text>
          </View>

          <FieldShell
            label="New ready-by"
            hint="When the job will be ready for a rider to collect."
            error={showErrors ? dateProblem : null}
          >
            <DateTimeField
              value={proposed}
              mode="datetime"
              minimumDate={earliest}
              onChange={(next) => {
                setProposed(next);
                setActionError(null);
              }}
              placeholder="Choose a date and time"
              accessibilityLabel="New ready-by date and time"
            />
          </FieldShell>

          <FieldShell
            label="Why does the job need more time?"
            hint="The client reads this when they decide. Say what changed and what you are doing about it."
            error={showErrors ? reasonProblem : null}
          >
            <NoteField
              value={reason}
              onChange={setReason}
              maxLength={RESCHEDULE_REASON_MAX}
              placeholder="Our laminator broke down. The part arrives Thursday morning."
              accessibilityLabel="Reason for the new deadline"
            />
          </FieldShell>

          <View className="gg-panel gap-2">
            <Text className="text-body font-medium text-text-primary">What happens next</Text>
            {WHAT_HAPPENS.map((line) => (
              <Text key={line} className="text-body text-text-secondary">
                {line}
              </Text>
            ))}
            <Text className="text-body text-text-secondary">
              Every request stays on your shop&apos;s record, whatever the answer.
            </Text>
          </View>
        </>
      ) : null}
    </FlowScreen>
  );
}
