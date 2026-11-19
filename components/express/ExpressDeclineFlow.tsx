import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";

import { DangerButton } from "@/components/DangerButton";
import { ExpressCountdown } from "@/components/ExpressCountdown";
import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { NoteField } from "@/components/controls/NoteField";
import { OptionList } from "@/components/controls/OptionList";
import * as api from "@/lib/api";
import { apiErrorCode, humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { EXPRESS_DECLINE_REASONS } from "@/lib/expressOrder";
import { askConfirm } from "@/store/sheets";

const OTHER = "Other";
const OPTIONS = [...EXPRESS_DECLINE_REASONS, OTHER].map((label) => ({ value: label, label }));

type Props = { job: api.Order; reload: () => Promise<unknown> };

/**
 * Declining an Express order: one tap for the reason, then it goes to the
 * next nearest Express shop. No record, no money — so the copy stays short.
 * The clock stays on screen: running out of time is also an answer.
 */
export function ExpressDeclineFlow({ job, reload }: Props) {
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [outcome, setOutcome] = useState<"declined" | "timed_out" | null>(null);

  const text = reason === OTHER ? other.trim() : reason;

  async function decline() {
    if (!text) {
      setShowErrors(true);
      return;
    }
    const ok = await askConfirm({
      question: "Decline this Express order?",
      consequence: "It goes to the next nearest shop now.",
      confirmLabel: "Decline",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.declineExpress(job.id, text);
      setOutcome("declined");
    } catch (e) {
      if (apiErrorCode(e) === "shop_acceptance_expired") setOutcome("timed_out");
      else {
        setError(humanizeApiError(e, offlineMessage("decline this order")));
        void reload();
      }
    } finally {
      setBusy(false);
    }
  }

  if (outcome) {
    return (
      <FlowScreen
        loading={false}
        error={null}
        onRetry={() => void reload()}
        title={outcome === "declined" ? "Declined" : "Time's up"}
        subject={job.title}
        lede="GRIDGO sent it to the next shop."
        footer={<PrimaryButton label="Back to jobs" onPress={() => router.navigate("/(tabs)/jobs")} />}
      >
        <View />
      </FlowScreen>
    );
  }

  return (
    <FlowScreen
      loading={false}
      error={null}
      onRetry={() => void reload()}
      title="Decline Express order"
      subject={job.title}
      actionError={error}
      footer={
        <>
          <DangerButton label={busy ? "Declining…" : "Decline"} disabled={busy} onPress={() => void decline()} />
          <SecondaryButton label="Keep it" disabled={busy} onPress={() => router.back()} />
        </>
      }
    >
      <ExpressCountdown order={job} onExpire={() => setOutcome("timed_out")} />
      <View className="gap-2">
        <Text className="text-body font-medium text-text-primary">Why?</Text>
        <OptionList
          options={OPTIONS}
          value={reason}
          onChange={(value) => {
            setReason(value);
            setShowErrors(false);
          }}
          accessibilityLabel="Reason for declining"
        />
        {reason === OTHER ? (
          <NoteField
            value={other}
            onChange={setOther}
            placeholder="Say why in a few words"
            accessibilityLabel="Your reason"
            maxLength={200}
          />
        ) : null}
        {showErrors && !text ? (
          <Text className="text-body text-error" accessibilityRole="alert">
            Pick a reason.
          </Text>
        ) : null}
      </View>
    </FlowScreen>
  );
}
