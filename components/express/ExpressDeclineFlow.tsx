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
import { isShopStaff, useSession } from "@/store/session";

const OTHER = "Other";
const OPTIONS = [...EXPRESS_DECLINE_REASONS, OTHER].map((label) => ({ value: label, label }));

type Props = { job: api.Order; reload: () => Promise<unknown> };

/**
 * "Can't do it" on an Express job (gridgo-supplier#269): one tap for the
 * reason, then it goes to the next nearest Express shop at the same price.
 * Nothing goes on the shop's record, and the screen says so — a shop that
 * fears a penalty lets the clock run out instead, which is slower for the
 * client. The clock stays on screen: running out of time is also an answer.
 */
export function ExpressDeclineFlow({ job, reload }: Props) {
  // The Express switch is the Owner's; Staff are told who can turn it off.
  const staff = useSession((s) => isShopStaff(s.user));
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
      question: "Send this job to another shop?",
      consequence: "It goes to the next nearest shop now. The client pays the same.",
      confirmLabel: "Send it",
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
        setError(humanizeApiError(e, offlineMessage("send this job to another shop")));
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
        title={outcome === "declined" ? "Sent to another shop" : "Time's up"}
        subject={job.title}
        lede={outcome === "declined" ? "Nothing goes on your record." : "GRIDGO sent it to the next shop."}
        footer={<PrimaryButton label="Back to To do" onPress={() => router.navigate("/(tabs)/home")} />}
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
      title="Why can't you take it?"
      lede="We'll send it to the next nearest shop. The client pays the same."
      subject={job.title}
      actionError={error}
      footer={
        <>
          <DangerButton label={busy ? "Sending…" : "Send to another shop"} disabled={busy} onPress={() => void decline()} />
          <SecondaryButton label="Keep it" disabled={busy} onPress={() => router.back()} />
          <Text className="text-center text-caption text-text-muted" testID="express-decline-no-penalty">
            {staff
              ? "Saying no is OK. It doesn't count against your shop. Busy all day? Ask the owner to turn Express off."
              : "Saying no is OK. It doesn't count against you. Busy all day? Turn Express off on your products."}
          </Text>
        </>
      }
    >
      <ExpressCountdown order={job} onExpire={() => setOutcome("timed_out")} />
      <View className="gap-2">
        <OptionList
          options={OPTIONS}
          value={reason}
          onChange={(value) => {
            setReason(value);
            setShowErrors(false);
          }}
          accessibilityLabel="Why you can't take it"
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
