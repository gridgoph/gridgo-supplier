import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { CoverageGlyph } from "@/components/CoverageGlyph";
import { FlowScreen } from "@/components/FlowScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { MoneyField } from "@/components/controls/MoneyField";
import { NoteField } from "@/components/controls/NoteField";
import { OptionList } from "@/components/controls/OptionList";
import { PercentField } from "@/components/controls/PercentField";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import {
  bpsPercent,
  correctableColourLines,
  correctionBaseline,
  correctionDraft,
  correctionProblem,
  correctionStart,
  percentToBps,
  readCorrection,
  sheetsLine,
  tierFor,
  tierLabel,
  type CorrectionDraftRow,
} from "@/lib/colourPricing";
import { formatPhp } from "@/lib/money";
import { CHANGE_REASON_MAX, canRequestChange, changeReasonError } from "@/lib/orderChanges";
import { useJob } from "@/hooks/useJob";
import { askConfirm } from "@/store/sheets";

function newKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `colour-${uuid}`;
  return `colour-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Correcting a clearly wrong colour estimate (gridgo-api
 * `docs/COLOUR_PRICING_API.md`, "Operations, order evidence and corrections").
 *
 * GRIDGO's reading is an estimate. When a page is clearly in another tier at
 * print size, the shop sets its reading and its own price for it, and the
 * client approves the corrected price before anything changes — the shop never
 * prints at a different price than the client agreed. It is an ordinary change
 * request underneath, so one may be open at a time and it follows the same
 * approval and payment as any other.
 *
 * Every page is sent, because GRIDGO wants each one exactly once. The extra is
 * worked out here only to show it: GRIDGO derives it again from the pages, so
 * none is sent. A lower total is a refund, which goes through the GRIDGO Team.
 */
export default function ColourCorrectionScreen() {
  const { id, line: lineParam } = useLocalSearchParams<{ id: string; line?: string }>();
  const { job, loading, error, reload } = useJob(id);

  const lines = job ? correctableColourLines(job) : [];
  const [lineId, setLineId] = useState<string | null>(lineParam ?? null);
  const line = lines.find((entry) => entry.item.id === lineId) ?? lines[0] ?? null;
  const quote = line?.quote ?? null;
  // The pages a correction starts from: the one the client last agreed to, else GRIDGO's reading.
  const start = quote && line ? correctionStart(quote, line.agreed) : null;

  // What the shop typed, for one line; another line starts again from GRIDGO's reading.
  const [typed, setTyped] = useState<{ lineId: string; rows: CorrectionDraftRow[] } | null>(null);
  const rows =
    line && start ? (typed?.lineId === line.item.id ? typed.rows : correctionDraft(start)) : [];
  const [reason, setReason] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // One key per body: resending the same correction replays GRIDGO's first answer.
  const sent = useRef<{ body: string; key: string } | null>(null);

  const tierSet = quote?.tierSet ?? "large_format";
  const limit = quote?.a3LimitBps;
  /** The shop's own rate per tier on this paper, from the pages GRIDGO priced. */
  const knownRates = new Map<string, number>();
  for (const page of start?.pages ?? []) {
    if (page.tier && page.sheetPriceMinor != null) knownRates.set(page.tier, page.sheetPriceMinor);
  }

  const allowed = job ? canRequestChange(job) && Boolean(line) : true;
  const baseline = quote && line ? correctionBaseline(quote, line.agreed) : null;
  const read = start && rows.length ? readCorrection(start, rows, baseline ?? 0) : null;
  const draftProblem = read ? correctionProblem(read, baseline) : null;
  const reasonProblem = changeReasonError(reason);
  // A lower total is said at once: it is a refund, not something to fix before sending.
  const lowered = Boolean(read?.ok && read.extraMinor < 0);

  function tierOf(percent: string) {
    const bps = percentToBps(percent);
    return bps == null ? null : tierFor(bps, tierSet, limit);
  }

  function setRow(index: number, patch: Partial<CorrectionDraftRow>) {
    if (!line) return;
    setTyped({
      lineId: line.item.id,
      rows: rows.map((row, at) => {
        if (at !== index) return row;
        const next = { ...row, ...patch };
        // A reading moved into another tier takes the shop's rate for that
        // tier, when another page on this job already shows it.
        if (patch.percent != null) {
          const before = tierOf(row.percent);
          const after = tierOf(patch.percent);
          const rate = after ? knownRates.get(after) : undefined;
          if (after && after !== before && rate != null) next.price = (rate / 100).toFixed(2);
        }
        return next;
      }),
    });
  }

  async function send() {
    if (!job || !line || !read?.ok || draftProblem || reasonProblem) {
      setShowErrors(true);
      return;
    }
    const confirmed = await askConfirm({
      question: read.extraMinor
        ? `Send this colour correction for ${formatPhp(read.extraMinor)} extra?`
        : "Send this colour correction at the same price?",
      consequence:
        "The client approves or declines. Until they approve, print every page at the price agreed at checkout.",
      confirmLabel: "Send correction",
      cancelLabel: "Not yet",
    });
    if (!confirmed) return;

    const body = {
      lineItemId: line.item.id,
      reason: reason.trim(),
      colourCorrection: { pages: read.pages },
    };
    const serialized = JSON.stringify(body);
    if (sent.current?.body !== serialized) sent.current = { body: serialized, key: newKey() };

    setBusy(true);
    setActionError(null);
    try {
      await api.requestOrderChange(job.id, body, sent.current.key);
      router.back();
    } catch (e) {
      setActionError(humanizeApiError(e, offlineMessage("send this correction")));
      void reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen
      loading={loading && !job}
      error={job ? null : error}
      onRetry={() => void reload()}
      title="Correct the colour price"
      subject={job?.title}
      lede="GRIDGO's reading is an estimate. If a page is clearly in another tier at print size, set its reading and your price for it. The client approves the corrected price before anything changes."
      actionError={actionError}
      footer={
        allowed ? (
          <>
            <PrimaryButton
              label={busy ? "Sending…" : "Send correction"}
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
          <Text className="text-body font-medium text-text-primary">This job cannot take a correction now</Text>
          <Text className="text-body text-text-secondary">
            A colour correction is a change request: it can be sent before the job is marked ready, one at a time,
            and not while a deadline request is waiting. Where the job stands is on the job.
          </Text>
        </View>
      ) : null}

      {job && allowed && line && quote ? (
        <>
          {lines.length > 1 ? (
            <FieldShell label="Which item?">
              <OptionList
                options={lines.map((entry) => ({
                  value: entry.item.id,
                  label: entry.item.itemName,
                  detail: `${entry.quote.paperSize ?? "Paper"}, ${entry.quote.pages.length} pages`,
                }))}
                value={line.item.id}
                onChange={setLineId}
                accessibilityLabel="Item to correct"
              />
            </FieldShell>
          ) : null}

          <Text className="text-body text-text-secondary">
            {line.item.itemName} on {quote.paperSize ?? "the chosen paper"}:{" "}
            {sheetsLine(quote.quantityMode, quote.quantity, quote.pages.length)}.
          </Text>

          <View className="gap-3">
            {quote.pages.map((page, index) => {
              const row = rows[index];
              if (!row) return null;
              const tier = tierOf(row.percent);
              const marked = showErrors && read && !read.ok && read.page === page.page;
              return (
                <View
                  key={`${page.fileId}:${page.page}`}
                  className={marked ? "gg-card gap-3 border-error" : "gg-card gap-3"}
                  testID="colour-correction-page"
                >
                  <View className="flex-row items-center gap-3">
                    <CoverageGlyph bps={page.strongColourBps} size="sm" />
                    <View className="min-w-0 flex-1">
                      <Text className="text-body font-medium text-text-primary">Page {page.page}</Text>
                      <Text className="text-caption text-text-muted">
                        GRIDGO measured {bpsPercent(page.strongColourBps)}
                        {page.sheetPriceMinor != null ? `, ${formatPhp(page.sheetPriceMinor)} a sheet` : ""}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row gap-3">
                    <View className="flex-1 gap-1">
                      <Text className="text-caption text-text-muted">Strong colour</Text>
                      <PercentField
                        value={row.percent}
                        onChange={(percent) => setRow(index, { percent })}
                        editable={!busy}
                        accessibilityLabel={`Page ${page.page} strong colour percent`}
                      />
                      <Text className="text-caption text-text-secondary">
                        {tier ? tierLabel(tier, limit) : "0 to 100"}
                      </Text>
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="text-caption text-text-muted">Your price a sheet</Text>
                      <MoneyField
                        value={row.price}
                        onChange={(price) => setRow(index, { price })}
                        editable={!busy}
                        accessibilityLabel={`Page ${page.page} your price a sheet`}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          <View className="gg-card-flush">
            <TotalRow label="Your line total now" value={baseline == null ? "—" : formatPhp(baseline)} />
            <TotalRow
              label={`Corrected, at ${quote.quantity} × each page`}
              value={read?.ok ? formatPhp(read.correctedLineSubtotalMinor) : "—"}
              divided
            />
            <TotalRow
              label="Extra for your shop"
              value={read?.ok && baseline != null && read.extraMinor >= 0 ? formatPhp(read.extraMinor) : "—"}
              divided
              strong
            />
          </View>
          <Text className="text-caption text-text-muted">
            GRIDGO adds its own fee on top for the client; it never comes out of your extra. The client pays for an
            increase before the job takes the new price. Your extra is paid with your last payout part.
          </Text>

          {(showErrors || lowered) && draftProblem ? (
            <Text className="text-body text-error" accessibilityRole="alert">
              {draftProblem}
            </Text>
          ) : null}

          <FieldShell
            label="What did you see at print size?"
            hint="The client reads this when they decide."
            error={showErrors ? reasonProblem : null}
          >
            <NoteField
              value={reason}
              onChange={setReason}
              maxLength={CHANGE_REASON_MAX}
              placeholder="Page 1 has a large orange fill across the title block when printed at 20x30."
              accessibilityLabel="What you saw at print size"
            />
          </FieldShell>
        </>
      ) : null}
    </FlowScreen>
  );
}

function TotalRow({
  label,
  value,
  divided = false,
  strong = false,
}: {
  label: string;
  value: string;
  divided?: boolean;
  strong?: boolean;
}) {
  return (
    <View
      className={
        divided
          ? "flex-row items-center justify-between gap-3 border-t border-outline-subtle px-4 py-3"
          : "flex-row items-center justify-between gap-3 px-4 py-3"
      }
    >
      <Text className={strong ? "text-body font-medium text-text-primary" : "text-body text-text-secondary"}>
        {label}
      </Text>
      <Text className={strong ? "text-body font-medium text-text-primary" : "text-body text-text-primary"}>{value}</Text>
    </View>
  );
}
