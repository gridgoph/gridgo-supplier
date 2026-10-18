/*
  What the client approved (gridgo-client#248; gridgo-api
  `docs/APPROVAL_PROOF_API.md`). The record a dispute is settled against:
  the spec, the artwork and the client's sign-off as they were at that
  moment, never rebuilt from today's listing.

  Two reads. The job carries a summary of each record (`approvalProof`), which
  is enough for the docket row to say "Signed Oct 17"; the full records come
  from `GET /orders/:id/approval-proof` when the shop opens that row.

  What this module refuses to read: the approving account, the device and
  the user agent. GRIDGO sends them as evidence for Operations; a shop is
  never told who the client is, so they are dropped here and reach no screen.
  The record's PDF carries them too, which is why the shop is not offered it.

  A `legacy_unrecorded` record means **no approval was collected**. It is
  never called signed or approved.
*/

export type ApprovalMethod = "drawn" | "one_tap";
export type ApprovalPhase = "checkout" | "sample";
export type ApprovalStatus = "approved" | "legacy_unrecorded";

export type ApprovalSummaryRecord = {
  id: string;
  phase: ApprovalPhase;
  status: ApprovalStatus;
  method: ApprovalMethod | null;
  at: string;
};

export type ApprovalSummary = {
  /** True when GRIDGO requires an approval before this job proceeds. */
  required: boolean;
  requiredMethod: ApprovalMethod | null;
  records: ApprovalSummaryRecord[];
};

export type ApprovedItem = {
  name: string;
  quantity: number | null;
  /** "Paper: 130gsm gloss", in the client's own chosen words. */
  options: string[];
  instructions: string | null;
};

export type ApprovalProofRecord = ApprovalSummaryRecord & {
  /** The words the client agreed to: "I approve this order". */
  statement: string | null;
  signatureFileId: string | null;
  samplePhotoFileId: string | null;
  items: ApprovedItem[];
  artworkCount: number;
  designLinkCount: number;
  /** The record's fingerprint, for quoting to Operations. */
  reference: string | null;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

function readSummaryRecord(raw: unknown): ApprovalSummaryRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const at = text(row.at);
  if (!text(row.id) || !at || !Number.isFinite(Date.parse(at))) return null;
  if (row.phase !== "checkout" && row.phase !== "sample") return null;
  if (row.status !== "approved" && row.status !== "legacy_unrecorded") return null;
  return {
    id: row.id as string,
    phase: row.phase,
    status: row.status,
    // An unrecorded record has no method, whatever else it carries.
    method: row.status === "approved" && (row.method === "drawn" || row.method === "one_tap") ? row.method : null,
    at,
  };
}

/** The job's summary, or null when GRIDGO sent none or there is nothing to say. */
export function approvalSummaryOf(order: { approvalProof?: unknown } | null | undefined): ApprovalSummary | null {
  const raw = order?.approvalProof;
  if (!raw || typeof raw !== "object") return null;
  const { requirement, records } = raw as Record<string, unknown>;
  const policy = requirement && typeof requirement === "object" ? (requirement as Record<string, unknown>) : null;
  const summary: ApprovalSummary = {
    required: policy?.required === true,
    requiredMethod: policy?.method === "drawn" || policy?.method === "one_tap" ? policy.method : null,
    records: Array.isArray(records)
      ? records.map(readSummaryRecord).filter((row): row is ApprovalSummaryRecord => row !== null)
      : [],
  };
  // Nothing recorded and nothing asked for: an older order with no row to draw.
  return summary.records.length || summary.required ? summary : null;
}

/** The newest real approval; a sample sign-off is as much an approval as checkout's. */
export function latestApproval<T extends ApprovalSummaryRecord>(records: T[]): T | null {
  return (
    records
      .filter((row) => row.status === "approved")
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null
  );
}

export function approvalDateLabel(at: string): string {
  return new Date(at).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Drawn signature" / "One-tap approval": how the client said yes. */
export function methodLabel(method: ApprovalMethod | null): string {
  if (method === "drawn") return "Drawn signature";
  if (method === "one_tap") return "One-tap approval";
  return "Not recorded";
}

export function phaseLabel(phase: ApprovalPhase): string {
  return phase === "sample" ? "Sample approval" : "Order approval";
}

/** The docket row's one line. `empty` when there is nothing behind it to open. */
export function approvalRowSummary(summary: ApprovalSummary): { summary: string; empty: boolean } {
  const latest = latestApproval(summary.records);
  if (latest) {
    const when = approvalDateLabel(latest.at);
    if (latest.phase === "sample") return { summary: `Sample signed · ${when}`, empty: false };
    return latest.method === "drawn"
      ? { summary: `Signed by the client · ${when}`, empty: false }
      : { summary: `Approved in one tap · ${when}`, empty: false };
  }
  if (summary.records.length) return { summary: "No approval was collected for this order", empty: false };
  return { summary: "Waiting for the client's approval", empty: true };
}

function readItem(raw: unknown): ApprovedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const name = text(row.itemNameSnapshot) ?? text(row.label) ?? text(row.title);
  if (!name) return null;
  const options = Array.isArray(row.options)
    ? row.options
        .map((option) => {
          if (!option || typeof option !== "object") return null;
          const { groupNameSnapshot, optionLabelSnapshot } = option as Record<string, unknown>;
          const label = text(optionLabelSnapshot);
          if (!label) return null;
          const group = text(groupNameSnapshot);
          return group ? `${group}: ${label}` : label;
        })
        .filter((option): option is string => option !== null)
    : // A quoted job's line names its size, material and finish directly.
      [row.size, row.material, row.finish].map(text).filter((value): value is string => value !== null);
  return { name, quantity: count(row.quantity), options, instructions: text(row.specialInstructions) };
}

function readSnapshot(raw: unknown): Pick<ApprovalProofRecord, "items" | "artworkCount" | "designLinkCount"> {
  const snapshot = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const lines = [
    ...(Array.isArray(snapshot.items) ? snapshot.items : []),
    ...(Array.isArray(snapshot.quoteLines) ? snapshot.quoteLines : []),
  ];
  let items = lines.map(readItem).filter((item): item is ApprovedItem => item !== null);
  // A single legacy request keeps its specification on the order itself.
  if (!items.length) {
    const single = readItem(snapshot.specification);
    if (single) items = [single];
  }
  const links = [
    ...(Array.isArray(snapshot.items)
      ? snapshot.items.flatMap((item) =>
          item && typeof item === "object" && Array.isArray((item as Record<string, unknown>).artworkLinks)
            ? ((item as Record<string, unknown>).artworkLinks as unknown[])
            : [],
        )
      : []),
    ...(snapshot.specification &&
    typeof snapshot.specification === "object" &&
    Array.isArray((snapshot.specification as Record<string, unknown>).artworkLinks)
      ? ((snapshot.specification as Record<string, unknown>).artworkLinks as unknown[])
      : []),
  ];
  return {
    items,
    artworkCount: Array.isArray(snapshot.artwork) ? snapshot.artwork.length : 0,
    designLinkCount: links.length,
  };
}

/** Full records from the proof read, without the account, device or user agent. */
export function parseApprovalProofs(raw: unknown): ApprovalProofRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const base = readSummaryRecord(entry);
    if (!base) return [];
    const row = entry as Record<string, unknown>;
    const approved = base.status === "approved";
    const sha = text(row.snapshotSha256);
    return [
      {
        ...base,
        statement: approved ? text(row.statement) : null,
        signatureFileId: approved && base.method === "drawn" ? text(row.signatureFileId) : null,
        samplePhotoFileId: approved && base.phase === "sample" ? text(row.samplePhotoFileId) : null,
        ...readSnapshot(row.snapshot),
        reference: sha ? sha.slice(0, 12).toUpperCase() : null,
      },
    ];
  });
}

/** Newest first: the record a shop is held to is the latest one. */
export function recordsNewestFirst(records: ApprovalProofRecord[]): ApprovalProofRecord[] {
  return [...records].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Said once above the records: why the row matters to a shop. */
export const APPROVAL_PROOF_NOTE =
  "This is what the client approved. If the print is ever questioned, GRIDGO checks it against this record, so make it to match.";

export const UNRECORDED_NOTE =
  "No approval was collected when this order was placed. Go by the spec and artwork above.";

export function itemLine(item: ApprovedItem): string {
  return item.quantity ? `${item.quantity} × ${item.name}` : item.name;
}

export function filesLine(record: Pick<ApprovalProofRecord, "artworkCount" | "designLinkCount">): string | null {
  const parts = [
    record.artworkCount ? `${record.artworkCount} ${record.artworkCount === 1 ? "print file" : "print files"}` : null,
    record.designLinkCount
      ? `${record.designLinkCount} ${record.designLinkCount === 1 ? "design link" : "design links"}`
      : null,
  ].filter(Boolean);
  return parts.length ? `Approved with ${parts.join(" and ")}` : null;
}
