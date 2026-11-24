import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { FieldShell } from "@/components/controls/FieldShell";
import { NoteField } from "@/components/controls/NoteField";
import { OptionList } from "@/components/controls/OptionList";
import { useJob } from "@/hooks/useJob";
import { useLastExpressJob } from "@/hooks/useLastExpressJob";
import { useNow } from "@/hooks/useNow";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { canGiveBack, giveBackLine, giveBackWindow } from "@/lib/homePrinter";
import { useHomePrinter } from "@/store/homePrinter";
import { askConfirm } from "@/store/sheets";

const REASONS = [
  { value: "printer", label: "My printer has a problem" },
  { value: "supplies", label: "I ran out of paper or ink" },
  { value: "away", label: "Something came up" },
  { value: "other", label: "Another reason" },
] as const;

type ReasonId = (typeof REASONS)[number]["value"];

/**
 * Giving an accepted Express job back, for a home printer (gridgo-api#412 §9).
 *
 * GRIDGO sends it to the next printer at the same price. Inside the first
 * minutes after accepting it costs nothing, and the screen says until when;
 * after that it is a late give-back, said plainly and without blame. The
 * reason is required by GRIDGO. Nothing here is yellow until the printer
 * has chosen to go ahead — the safe choice, keeping the job, is always there.
 */
export default function GiveBackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job: live, loading, error, reload } = useJob(id);
  // A job given back leaves this printer at once; keep it for the outcome.
  const job = useLastExpressJob(live);
  const now = useNow(1000);
  const [reason, setReason] = useState<ReasonId | null>(null);
  const [detail, setDetail] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<{ free: boolean } | null>(null);

  const window = job ? giveBackWindow(job, now) : { free: false, freeUntil: null };

  async function giveBack() {
    if (!job) return;
    if (!reason) {
      setShowErrors(true);
      return;
    }
    const free = giveBackWindow(job).free;
    const ok = await askConfirm({
      question: `Give back ${job.title}?`,
      consequence: free
        ? "GRIDGO sends it to the next printer at the same price. This one is free."
        : "GRIDGO sends it to the next printer at the same price. It counts as a late give-back this week.",
      confirmLabel: "Give it back",
      cancelLabel: "Keep this job",
    });
    if (!ok) return;
    setBusy(true);
    setActionError(null);
    const label = REASONS.find((r) => r.value === reason)?.label ?? "Another reason";
    try {
      await api.giveBackExpress(job.id, detail.trim() ? `${label}: ${detail.trim()}` : label);
      setDone({ free: giveBackWindow(job).free });
      void useHomePrinter.getState().load();
    } catch (e) {
      setActionError(humanizeApiError(e, offlineMessage("give this job back")));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <FlowScreen
        loading={false}
        error={null}
        onRetry={() => void reload()}
        title="Given back"
        subject={job?.title}
        lede="GRIDGO is sending it to the next printer at the same price."
        footer={<PrimaryButton label="Go to To do" onPress={() => router.navigate("/(tabs)/home")} />}
      >
        <View className="gg-panel gap-1">
          <Text className="text-body text-text-secondary">
            {done.free
              ? "It was within the free time, so nothing counts against you."
              : "It counts as a late give-back this week. Delete any of the client's files you saved."}
          </Text>
        </View>
      </FlowScreen>
    );
  }

  const available = job ? canGiveBack(job) : false;

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title="Give this job back"
      subject={job?.title}
      lede="GRIDGO sends it to the next printer at the same price."
      actionError={actionError}
      footer={
        available ? (
          <>
            <PrimaryButton
              label={busy ? "Giving back…" : "Give it back"}
              disabled={busy}
              onPress={() => void giveBack()}
            />
            <SecondaryButton label="Keep this job" disabled={busy} onPress={() => router.back()} />
          </>
        ) : (
          <SecondaryButton label="Back to the job" onPress={() => router.back()} />
        )
      }
    >
      {job ? (
        <View className="gap-2" testID="give-back-window">
          {window.free ? (
            <StatusChip tone="success" icon="circle-check" label={giveBackLine(window)} />
          ) : (
            <StatusChip tone="neutral" icon="clock" label={giveBackLine(window)} />
          )}
          <Text className="text-body text-text-secondary">
            {window.free
              ? "Giving it back now costs nothing."
              : "Three late give-backs in a week pause offers for a day."}
          </Text>
        </View>
      ) : null}

      {available ? (
        <>
          <FieldShell label="Why?" error={showErrors && !reason ? "Pick the reason that fits closest." : null}>
            <OptionList
              options={REASONS}
              value={reason}
              onChange={(value) => {
                setReason(value);
                setShowErrors(false);
              }}
              accessibilityLabel="Why you are giving it back"
            />
          </FieldShell>
          <FieldShell label="Anything else (optional)">
            <NoteField
              value={detail}
              onChange={setDetail}
              placeholder="For example, the printer jammed on page 3."
              accessibilityLabel="Anything else"
            />
          </FieldShell>
        </>
      ) : job ? (
        <Text className="text-body text-text-secondary">
          This job has moved on and can no longer be given back. Open it to see what is next.
        </Text>
      ) : null}
    </FlowScreen>
  );
}
