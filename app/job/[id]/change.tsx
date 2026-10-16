import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { MoneyField } from "@/components/controls/MoneyField";
import { NoteField } from "@/components/controls/NoteField";
import { OptionList } from "@/components/controls/OptionList";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { formatPhp, parseMoney } from "@/lib/money";
import {
  CHANGE_REASON_MAX,
  PROPOSED_CHANGE_MAX,
  canRequestChange,
  changeReasonError,
  itemInstructions,
  proposedChangeError,
} from "@/lib/orderChanges";
import { orderProductionItems } from "@/lib/productionSpecs";
import { useJob } from "@/hooks/useJob";
import { askConfirm } from "@/store/sheets";

/** What follows a request, in the order it can happen. */
const WHAT_HAPPENS = [
  "The client approves or declines. Until they approve, make the job as ordered.",
  "With an extra, the client pays for the change after approving. GRIDGO adds its own fee on top for them; it never comes out of your extra.",
  "Start the change only once the job says it is agreed. If the client declines, make the job as ordered.",
  "Your extra is paid with your last payout part.",
] as const;

function newKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `change-${uuid}`;
  return `change-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Asking the client to approve a change, when the special instructions cost
 * more than the price on the board (gridgo-api `docs/ORDER_CHANGES_API.md`).
 *
 * The client reads all three things the shop writes here: what it will do
 * differently, the extra for its own shop, and why. The extra is the shop's
 * own figure — GRIDGO's fee sits on top for the client and is not this app's
 * business. Nothing changes until the client approves and, for a priced
 * change, pays.
 */
export default function RequestChangeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, loading, error, reload } = useJob(id);

  const items = job ? orderProductionItems(job) : [];
  const notes = job ? itemInstructions(job) : [];
  // An order from before line items has none to name; GRIDGO then takes no line.
  const lined = Boolean(job?.productionItems?.length);
  const firstNoted = notes.find((note) => note.text)?.lineItemId ?? items[0]?.id ?? null;

  const [lineItemId, setLineItemId] = useState<string | null>(null);
  const [proposed, setProposed] = useState("");
  const [extra, setExtra] = useState("");
  const [reason, setReason] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // One key per body: resending the same request replays GRIDGO's first answer.
  const sent = useRef<{ body: string; key: string } | null>(null);

  const chosenLine = lineItemId ?? firstNoted;
  const chosenNote = notes.find((note) => note.lineItemId === chosenLine)?.text ?? null;
  const money = parseMoney(extra);
  const proposedProblem = proposedChangeError(proposed);
  const reasonProblem = changeReasonError(reason);
  const extraProblem = money.ok ? null : money.error.replace("Your price", "The extra");
  const allowed = job ? canRequestChange(job) : true;

  async function send() {
    if (!job || proposedProblem || reasonProblem || !money.ok) {
      setShowErrors(true);
      return;
    }
    const extraMinor = money.minor ?? 0;
    const confirmed = await askConfirm({
      question: extraMinor
        ? `Ask the client to approve this change for ${formatPhp(extraMinor)} extra?`
        : "Ask the client to approve this change at no extra cost?",
      consequence: "Nothing changes until they approve. Keep making the job as ordered until the job says it is agreed.",
      confirmLabel: "Send request",
      cancelLabel: "Not yet",
    });
    if (!confirmed) return;

    const body = {
      ...(lined && chosenLine ? { lineItemId: chosenLine } : {}),
      reason: reason.trim(),
      proposedSpec: proposed.trim(),
      extraPrincipalMinor: extraMinor,
    };
    const serialized = JSON.stringify(body);
    if (sent.current?.body !== serialized) sent.current = { body: serialized, key: newKey() };

    setBusy(true);
    setActionError(null);
    try {
      await api.requestOrderChange(job.id, body, sent.current.key);
      router.back();
    } catch (e) {
      setActionError(humanizeApiError(e, offlineMessage("send this request")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title="Request a change"
      subject={job?.title}
      lede="When the special instructions cost more or need a different spec, ask the client to approve the change. Nothing changes until they do."
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
            A change can be asked for before the job is marked ready, one at a time, and not while a
            deadline request is waiting. Where the job stands is on the job.
          </Text>
        </View>
      ) : null}

      {job && allowed ? (
        <>
          {lined && items.length > 1 ? (
            <FieldShell label="Which item?">
              <OptionList
                options={items.map((item, index) => ({
                  value: item.id,
                  label: `Item ${index + 1} · ${item.itemName}`,
                  detail: notes.find((note) => note.lineItemId === item.id)?.text || "No special instructions",
                }))}
                value={chosenLine}
                onChange={setLineItemId}
                accessibilityLabel="Item to change"
              />
            </FieldShell>
          ) : chosenNote ? (
            <View className="flex-row gap-3">
              <View className="w-1 rounded-pill bg-warning" />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-caption text-text-muted">The client asked</Text>
                <Text className="text-body-lg text-text-primary">{chosenNote}</Text>
              </View>
            </View>
          ) : null}

          <FieldShell
            label="What will you do differently?"
            hint="The client reads this as the change they approve. Say it as you will make it."
            error={showErrors ? proposedProblem : null}
          >
            <NoteField
              value={proposed}
              onChange={setProposed}
              maxLength={PROPOSED_CHANGE_MAX}
              placeholder="Staple on the left with two staples; same paper and print settings."
              accessibilityLabel="The change you will make"
            />
          </FieldShell>

          <FieldShell
            label="Extra for your shop"
            hint="Your own price for the extra work. Leave it empty if the change costs nothing more."
            error={showErrors ? extraProblem : null}
          >
            <MoneyField value={extra} onChange={setExtra} accessibilityLabel="Extra for your shop, in pesos" />
          </FieldShell>

          <FieldShell
            label="Why does the job need this change?"
            hint="The client reads this when they decide."
            error={showErrors ? reasonProblem : null}
          >
            <NoteField
              value={reason}
              onChange={setReason}
              maxLength={CHANGE_REASON_MAX}
              placeholder="Stapling on the left needs a second pass through our finisher."
              accessibilityLabel="Reason for the change"
            />
          </FieldShell>

          <View className="gg-panel gap-2">
            <Text className="text-body font-medium text-text-primary">What happens next</Text>
            {WHAT_HAPPENS.map((line) => (
              <Text key={line} className="text-body text-text-secondary">
                {line}
              </Text>
            ))}
          </View>
        </>
      ) : null}
    </FlowScreen>
  );
}
