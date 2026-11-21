import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Check, CircleCheck, Lock, Trash2 } from "lucide-react-native";

import { DigitBoxes } from "@/components/DigitBoxes";
import { NumberPad } from "@/components/NumberPad";
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
import { formatPhp } from "@/lib/api";
import { orderReference } from "@/lib/orderReference";
import { alreadyPaidAtCounter, workLine } from "@/lib/todo";
import { useFileOpens } from "@/store/fileOpens";
import { isShopStaff, useSession } from "@/store/session";

/**
 * Handing over an Express pickup: the client reads out the six-digit code
 * from their phone, the shop types it, and the order is closed.
 *
 * The code goes the moment the sixth digit is in — a busy counter should not
 * need a second tap. The screen draws its own number pad, so the boxes are
 * never covered by the phone's keyboard (gridgo-supplier#269). A wrong code empties the boxes and turns them red until
 * the next digit; five wrong ones lock the counter for fifteen minutes, which GRIDGO
 * counts and this screen only shows.
 */
export default function CounterCodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);
  const colors = useThemeColors();
  const staff = useSession((s) => isShopStaff(s.user));
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
        footer={<PrimaryButton label="Next job" onPress={() => router.navigate("/(tabs)/home")} />}
      >
        <View className="items-center gap-3 py-6" testID="counter-code-done">
          <CircleCheck size={56} color={colors.success} strokeWidth={1.75} />
          <Text className="text-h2 text-text-primary">Salamat po!</Text>
          {/*
            What the job adds to the shop's earnings, never when it arrives:
            GRIDGO releases it with the shop's payouts, on GRIDGO's schedule.
          */}
          {!staff && job?.supplierPriceMinor != null ? (
            <Text className="text-center text-body-lg text-text-secondary" testID="counter-code-earned">
              {formatPhp(job.supplierPriceMinor)} is added to your earnings.
            </Text>
          ) : (
            <Text className="text-center text-body-lg text-text-secondary">The client has their order.</Text>
          )}
        </View>
        {job ? <DeleteFilesCard fileIds={job.artworkFileIds ?? []} /> : null}
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
      title="Type the client's code"
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
          <Text className="text-body-lg text-text-secondary">
            {`${[orderReference(job.id) ? `#${orderReference(job.id)}` : null, workLine(job)]
              .filter(Boolean)
              .join(" · ")}. The client shows 6 numbers on their phone.`}
          </Text>
          <DigitBoxes
            value={code}
            onChange={change}
            onSubmit={() => void submit(code)}
            editable={!busy && !locked}
            invalid={wrong}
            systemKeyboard={false}
            accessibilityLabel="Client's 6-digit pickup code"
            testID="counter-code-input"
          />
          {wrong ? (
            <Text className="text-body font-medium text-error" accessibilityRole="alert" testID="counter-code-wrong">
              Wrong code. Check it with the client.
            </Text>
          ) : null}
          {alreadyPaidAtCounter(job) ? (
            <View className="flex-row items-center gap-2" testID="counter-code-paid">
              <Check size={18} color={colors.success} strokeWidth={2.5} />
              <Text className="text-body font-medium text-success">Already paid. Don&apos;t collect cash.</Text>
            </View>
          ) : null}
          {!wrong && !locked ? (
            <Text className="text-caption text-text-muted">It hands over by itself when the 6th number is in.</Text>
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
          <View className="mt-2">
            <NumberPad
              disabled={busy || locked}
              onDigit={(digit) => change(code + digit)}
              onDelete={() => change(code.slice(0, -1))}
            />
          </View>
        </View>
      ) : null}
    </FlowScreen>
  );
}

/**
 * Only after a file was opened on this phone: a reminder to delete the
 * client's files (gridgo-supplier#269). One tap answers it either way.
 */
function DeleteFilesCard({ fileIds }: { fileIds: string[] }) {
  const colors = useThemeColors();
  const opened = useFileOpens((s) => s.fileIds);
  const forget = useFileOpens((s) => s.forget);
  const held = fileIds.filter((id) => opened.includes(id));
  if (!held.length) return null;
  return (
    <View className="gg-card gap-3" testID="delete-files-card">
      <View className="flex-row items-center gap-2">
        <Trash2 size={18} color={colors.textPrimary} strokeWidth={2} />
        <Text className="text-body-lg font-medium text-text-primary">Delete the client&apos;s files</Text>
      </View>
      <Text className="text-body text-text-secondary">
        You opened {held.length === 1 ? "a file" : `${held.length} files`} from this job on this phone. If you saved
        {held.length === 1 ? " it" : " them"}, delete {held.length === 1 ? "it" : "them"} now. It protects the
        client&apos;s privacy.
      </Text>
      <SecondaryButton label="Deleted, or only viewed" onPress={() => forget(held)} />
    </View>
  );
}
