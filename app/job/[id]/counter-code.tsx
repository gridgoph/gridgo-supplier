import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CircleCheck, Lock } from "lucide-react-native";

import { DigitBoxes } from "@/components/DigitBoxes";
import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { formatCountdown } from "@/lib/acceptWindow";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import {
  awaitsCounterCode,
  COUNTER_CODE_LENGTH,
  counterCodeDigits,
  counterCodeOutcome,
  expressView,
} from "@/lib/expressOrder";
import { useJob } from "@/hooks/useJob";
import { useNow } from "@/hooks/useNow";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Handing over an Express pickup: the client reads out the six-digit code
 * from their phone, the shop types it, and the order is closed.
 *
 * The code goes the moment the sixth digit is in — a busy counter should not
 * need a second tap. A wrong code empties the boxes and turns them red until
 * the next digit; five wrong ones lock the counter for fifteen minutes, which GRIDGO
 * counts and this screen only shows.
 */
export default function CounterCodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);
  const colors = useThemeColors();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const sending = useRef(false);

  const now = useNow(lockedUntil ? 1000 : null);
  const locked = lockedUntil != null && lockedUntil.getTime() > now.getTime();

  const submit = useCallback(
    async (value: string) => {
      if (!job || sending.current || value.length !== COUNTER_CODE_LENGTH) return;
      sending.current = true;
      setBusy(true);
      setActionError(null);
      try {
        await api.enterCounterCode(job.id, value);
        setDone(true);
      } catch (e) {
        const outcome = counterCodeOutcome(e);
        if (outcome.kind === "wrong") {
          // Cleared at once so the next digit starts a fresh code; the red stays until then.
          setCode("");
          setWrong(true);
        }
        else if (outcome.kind === "locked") {
          setCode("");
          // GRIDGO always names the time; a missing one still locks for its fifteen minutes.
          setLockedUntil(outcome.until ?? new Date(Date.now() + 15 * 60_000));
        } else setActionError(humanizeApiError(outcome.error, offlineMessage("check this code")));
      } finally {
        sending.current = false;
        setBusy(false);
      }
    },
    [job],
  );

  function change(next: string) {
    const digits = counterCodeDigits(next);
    setWrong(false);
    setCode(digits);
    if (digits.length === COUNTER_CODE_LENGTH) void submit(digits);
  }

  if (done) {
    return (
      <FlowScreen
        loading={false}
        error={null}
        onRetry={() => void reload()}
        title="Handed over"
        subject={job?.title}
        footer={<PrimaryButton label="Back to jobs" onPress={() => router.navigate("/(tabs)/jobs")} />}
      >
        <View className="items-center gap-3 py-6" testID="counter-code-done">
          <CircleCheck size={56} color={colors.success} strokeWidth={1.75} />
          <Text className="text-body-lg text-text-secondary">The client has their order.</Text>
        </View>
      </FlowScreen>
    );
  }

  const view = expressView(job);
  const waiting = awaitsCounterCode(job);

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title="Enter pickup code"
      subject={job?.title}
      actionError={actionError}
      footer={
        !job ? null : !waiting ? (
          <SecondaryButton label="Back to the job" onPress={() => router.back()} />
        ) : code.length === COUNTER_CODE_LENGTH && !wrong && !locked ? (
          // The code sends itself; this is the retry after a dropped connection.
          <PrimaryButton label={busy ? "Checking…" : "Hand over"} disabled={busy} onPress={() => void submit(code)} />
        ) : null
      }
    >
      {job && !waiting ? (
        <Text className="text-body-lg text-text-secondary">
          {view?.pickedUp ? "Already handed over." : "This order is not waiting at your counter."}
        </Text>
      ) : job ? (
        <View className="gap-4">
          <Text className="text-body-lg text-text-secondary">Ask the client for the 6-digit code on their phone.</Text>
          <DigitBoxes
            value={code}
            onChange={change}
            onSubmit={() => void submit(code)}
            editable={!busy && !locked}
            invalid={wrong}
            accessibilityLabel="Client's 6-digit pickup code"
            testID="counter-code-input"
          />
          {wrong ? (
            <Text className="text-body font-medium text-error" accessibilityRole="alert" testID="counter-code-wrong">
              Wrong code. Check it with the client.
            </Text>
          ) : null}
          {locked && lockedUntil ? (
            <View
              className="gg-card flex-row items-center gap-3 border-warning"
              accessibilityRole="alert"
              testID="counter-code-locked"
            >
              <Lock size={22} color={colors.warning} strokeWidth={2} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-body font-medium text-text-primary">Too many tries</Text>
                <Text className="text-body text-text-secondary" style={{ fontVariant: ["tabular-nums"] }}>
                  Try again in {formatCountdown(lockedUntil.getTime() - now.getTime())}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </FlowScreen>
  );
}
