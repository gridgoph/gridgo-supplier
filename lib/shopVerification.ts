import { formatPhp } from "@/lib/money";

/**
 * Getting verified while already taking jobs (gridgo-api
 * `docs/SUPPLIER_VERIFICATION_API.md`, issue report F318781A).
 *
 * A shop that finished sign-up takes online jobs before GRIDGO checks its ID
 * and permit. Until it is verified, payouts stop at a cap and anything over it
 * waits; new orders pause when the window ends, while open jobs still finish.
 * This module is the only place that reads `GET /me/supplier-verification` and
 * the only place its states become words.
 *
 * Three rules every screen built on it keeps:
 * - The cap and the window are GRIDGO's settings. Nothing here hard-codes
 *   ₱5,000 or 30 days; every figure comes from the read.
 * - Money waiting on verification is **waiting**, never lost or "held back".
 * - Unverified is never a bad mark. No label here says what a shop is not;
 *   the only badge is the positive one, "Verified".
 *
 * The route is the Owner's. An API without it answers 404, and then nothing
 * new is drawn anywhere: the read normalises to `null`.
 */

export type VerificationState = "not_submitted" | "being_checked" | "verified";

export type ShopVerification = {
  verified: boolean;
  verificationState: VerificationState;
  deadlineAt: string | null;
  daysLeft: number;
  /** Null until the last seven days: the countdown is shown only then. */
  countdownDays: number | null;
  payoutCapMinor: number;
  paidBeforeVerificationMinor: number;
  remainingCapMinor: number;
  capReached: boolean;
  heldMinor: number;
  recoveryDueMinor: number;
  paidOpenRegularJobs: number;
  newOrdersPaused: boolean;
};

/** The three papers GRIDGO checks. `sample_work` belongs to the older accreditation. */
export type VerificationPaper = "valid_id" | "id_selfie" | "business_permit";

export type VerificationFile = {
  fileId: string;
  paper: VerificationPaper | null;
  /** GRIDGO's own document type, including a home printer's papers (`lib/homePrinter`). */
  documentType: string | null;
  sentAt: string | null;
};

/** One payout waiting on verification, from the ledger. */
export type WaitingPayout = {
  key: string;
  orderId: string | null;
  amountMinor: number;
  /** Why it waits: over the cap, or a third regular job with a paid stage. */
  reason: "cap" | "open_jobs";
};

export type ShopVerificationRead = {
  verification: ShopVerification;
  files: VerificationFile[];
  waiting: WaitingPayout[];
};

/* --------------------------------------------------------------------------
   Reading
   -------------------------------------------------------------------------- */

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function minor(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

const STATES: readonly VerificationState[] = ["not_submitted", "being_checked", "verified"];

/** The summary, or null when GRIDGO did not send one. */
export function readVerification(value: unknown): ShopVerification | null {
  const row = record(value);
  if (!row || typeof row.verified !== "boolean") return null;
  const verified = row.verified;
  const state = STATES.includes(row.verificationState as VerificationState)
    ? (row.verificationState as VerificationState)
    : verified
      ? "verified"
      : "not_submitted";
  const countdown =
    typeof row.countdownDays === "number" && Number.isFinite(row.countdownDays)
      ? Math.max(0, Math.floor(row.countdownDays))
      : null;
  return {
    verified,
    verificationState: state,
    deadlineAt: text(row.deadlineAt),
    daysLeft: typeof row.daysLeft === "number" ? Math.max(0, Math.floor(row.daysLeft)) : 0,
    countdownDays: verified ? null : countdown,
    payoutCapMinor: minor(row.payoutCapMinor),
    paidBeforeVerificationMinor: minor(row.paidBeforeVerificationMinor),
    remainingCapMinor: minor(row.remainingCapMinor),
    capReached: !verified && row.capReached === true,
    heldMinor: minor(row.heldMinor),
    recoveryDueMinor: minor(row.recoveryDueMinor),
    paidOpenRegularJobs: minor(row.paidOpenRegularJobs),
    newOrdersPaused: row.newOrdersPaused === true,
  };
}

const PAPERS: readonly VerificationPaper[] = ["valid_id", "id_selfie", "business_permit"];

function paperOf(file: Record<string, unknown>): VerificationPaper | null {
  const direct = file.verificationDocumentType ?? file.documentType;
  if (PAPERS.includes(direct as VerificationPaper)) return direct as VerificationPaper;
  const refs = Array.isArray(file.references) ? file.references : [];
  for (const ref of refs) {
    const type = record(ref)?.documentType;
    if (PAPERS.includes(type as VerificationPaper)) return type as VerificationPaper;
  }
  return null;
}

function rawType(file: Record<string, unknown>): string | null {
  const direct = file.verificationDocumentType ?? file.documentType;
  if (typeof direct === "string") return direct;
  const refs = Array.isArray(file.references) ? file.references : [];
  for (const ref of refs) {
    const type = record(ref)?.documentType;
    if (typeof type === "string") return type;
  }
  return null;
}

/**
 * Payouts whose latest ledger entry is still `held`. The ledger is
 * append-only, so a later `available`, `reserved` or `released` entry under
 * the same key means it has moved on.
 */
export function waitingPayouts(ledger: unknown): WaitingPayout[] {
  if (!Array.isArray(ledger)) return [];
  const latest = new Map<string, Record<string, unknown>>();
  for (const value of ledger) {
    const entry = record(value);
    const key = entry ? text(entry.payoutKey) : null;
    if (!entry || !key) continue;
    latest.set(key, entry);
  }
  const out: WaitingPayout[] = [];
  for (const [key, entry] of latest) {
    if (entry.kind !== "held") continue;
    const amountMinor = minor(entry.amountMinor);
    if (!amountMinor) continue;
    const reason = record(entry.data)?.reason === "verification_open_jobs" ? "open_jobs" : "cap";
    out.push({ key, orderId: text(entry.orderId), amountMinor, reason });
  }
  return out;
}

export function readShopVerification(value: unknown): ShopVerificationRead | null {
  const body = record(value);
  const verification = readVerification(body?.verification);
  if (!body || !verification) return null;
  const files = (Array.isArray(body.verificationDocuments) ? body.verificationDocuments : [])
    .map(record)
    .filter((file): file is Record<string, unknown> => file != null && typeof file.fileId === "string")
    .map((file) => ({
      fileId: file.fileId as string,
      paper: paperOf(file),
      documentType: rawType(file),
      sentAt: text(file.readyAt) ?? text(file.createdAt),
    }));
  return { verification, files, waiting: waitingPayouts(body.ledger) };
}

/* --------------------------------------------------------------------------
   The papers and why
   -------------------------------------------------------------------------- */

export type PaperDefinition = {
  paper: VerificationPaper;
  title: string;
  detail: string;
};

export const VERIFICATION_PAPERS: readonly PaperDefinition[] = [
  { paper: "valid_id", title: "Your ID", detail: "Any government ID with your photo" },
  { paper: "id_selfie", title: "Selfie with your ID", detail: "Hold the ID next to your face" },
  { paper: "business_permit", title: "Business permit", detail: "Mayor's permit or DTI · a photo is fine" },
] as const;

/** What a shop gets once verified. Each line is true of the platform today. */
export function verificationBenefits(v: ShopVerification): { title: string; detail: string }[] {
  return [
    { title: "Verified badge", detail: "Clients see it next to your shop name" },
    { title: "Seen first", detail: "Shown before shops nearby without it" },
    {
      title: "No payout limit",
      detail: v.payoutCapMinor
        ? `Until then, payouts stop at ${formatPhp(v.payoutCapMinor)}`
        : "All your pay, with no limit",
    },
    { title: "Orders never pause", detail: "New orders keep coming after your time to verify ends" },
  ];
}

/** Which papers GRIDGO already has, newest first per paper. */
export function papersOnFile(files: VerificationFile[]): Partial<Record<VerificationPaper, VerificationFile>> {
  const out: Partial<Record<VerificationPaper, VerificationFile>> = {};
  for (const file of files) {
    if (!file.paper) continue;
    const current = out[file.paper];
    if (!current || (file.sentAt ?? "") > (current.sentAt ?? "")) out[file.paper] = file;
  }
  return out;
}

/* --------------------------------------------------------------------------
   Words for To do and Money
   -------------------------------------------------------------------------- */

export type VerifyNotice = {
  /** "warning" only when new orders have actually stopped. Never "error". */
  tone: "neutral" | "warning";
  title: string;
  body: string;
  /** The short countdown chip, only in the last seven days. */
  chip: string | null;
  /** The button, when there is still something for the shop to do. */
  action: string | null;
};

function daysWord(days: number): string {
  return days === 1 ? "1 day left" : `${days} days left`;
}

/** The papers GRIDGO does not have yet, in the screen's order. */
export function missingPapers(files: VerificationFile[]): VerificationPaper[] {
  const onFile = papersOnFile(files);
  return VERIFICATION_PAPERS.map((d) => d.paper).filter((paper) => !onFile[paper]);
}

const PAPER_NOUN: Record<VerificationPaper, string> = {
  valid_id: "your ID",
  id_selfie: "a selfie with your ID",
  business_permit: "your business permit",
};

function paperList(papers: readonly VerificationPaper[]): string {
  const nouns = papers.map((paper) => PAPER_NOUN[paper]);
  return nouns.length <= 1 ? (nouns[0] ?? "") : `${nouns.slice(0, -1).join(", ")} and ${nouns[nouns.length - 1]}`;
}

/**
 * Where the shop is with its papers. GRIDGO says "being checked" as soon as
 * one paper is in, so "all sent" also needs every paper on file; until then
 * the cards keep asking for the rest, by name.
 */
function papersProgress(v: ShopVerification, missing: readonly VerificationPaper[]) {
  const checking = v.verificationState === "being_checked";
  const allSent = checking && missing.length === 0;
  const partly = checking && missing.length > 0;
  return {
    allSent,
    partly,
    rest: paperList(missing),
    action: allSent ? null : partly ? "Finish verifying" : "Get verified",
  };
}

/**
 * The To do card. Null when there is nothing to say: verified shops, and a
 * shop whose papers are all with GRIDGO and that has no limit in its way.
 * `missing` comes from `missingPapers(read.files)`.
 */
export function todoVerifyNotice(
  v: ShopVerification,
  missing: readonly VerificationPaper[],
): VerifyNotice | null {
  if (v.verified) return null;
  const { allSent, partly, rest, action } = papersProgress(v, missing);

  if (v.recoveryDueMinor > 0) {
    return {
      tone: "warning",
      title: "New orders are paused",
      body: `A job was dropped after part of it was paid. ${formatPhp(v.recoveryDueMinor)} will come out of your next payouts. Your open jobs still finish.`,
      chip: null,
      action,
    };
  }
  if (v.newOrdersPaused) {
    return {
      tone: "warning",
      title: "New orders are paused",
      body: allSent
        ? "GRIDGO is checking your papers. New orders start again once you're verified. Your open jobs still finish."
        : partly
          ? `Your time to get verified has ended. Send ${rest} and new orders start again once you're verified. Your open jobs still finish.`
          : "Your time to get verified has ended. Send your papers and new orders start again once GRIDGO checks them. Your open jobs still finish.",
      chip: null,
      action,
    };
  }
  if (v.capReached) {
    return {
      tone: "neutral",
      title: `Payouts over ${formatPhp(v.payoutCapMinor)} are waiting`,
      body: allSent
        ? "GRIDGO is checking your papers. The rest is paid in full once you're verified. Keep taking jobs."
        : partly
          ? `The rest is paid in full once you're verified. Send ${rest} to finish.`
          : "The rest is paid in full once you're verified. Keep taking jobs.",
      chip: v.countdownDays != null ? daysWord(v.countdownDays) : null,
      action,
    };
  }
  if (allSent) {
    if (v.countdownDays == null) return null;
    return {
      tone: "neutral",
      title: "GRIDGO is checking your papers",
      body: "Keep taking jobs while we check. We'll tell you when you're verified.",
      chip: daysWord(v.countdownDays),
      action: null,
    };
  }
  if (partly) {
    return {
      tone: "neutral",
      title: "Finish getting verified",
      body: `GRIDGO is checking what you sent. Send ${rest} to finish.`,
      chip: v.countdownDays != null ? daysWord(v.countdownDays) : null,
      action,
    };
  }
  if (v.countdownDays != null) {
    return {
      tone: "neutral",
      title: "Get verified to keep getting orders",
      body: "New orders pause when your time is up. Your ID and permit take about a minute.",
      chip: daysWord(v.countdownDays),
      action,
    };
  }
  return {
    tone: "neutral",
    title: "Get verified, get more jobs",
    body: "Verified shops are shown first and have no payout limit.",
    chip: null,
    action,
  };
}

/** The Money tab banner, drawn for as long as the shop is not verified. */
export function moneyVerifyBanner(
  v: ShopVerification,
  missing: readonly VerificationPaper[],
): VerifyNotice | null {
  if (v.verified) return null;
  const { allSent, partly, rest, action } = papersProgress(v, missing);
  const cap = formatPhp(v.payoutCapMinor);
  const paid = `${formatPhp(v.paidBeforeVerificationMinor)} of ${cap} paid out so far`;
  return {
    tone: "neutral",
    title: v.capReached
      ? `Payouts over ${cap} are waiting`
      : `Get verified to unlock payouts over ${cap}`,
    body: [
      `${paid}.`,
      v.recoveryDueMinor > 0
        ? `${formatPhp(v.recoveryDueMinor)} from a dropped job will come out of your next payouts.`
        : null,
      allSent ? "GRIDGO is checking your papers." : null,
      partly ? `Send ${rest} to finish.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    chip: null,
    action,
  };
}

/** One line under a waiting payout. Never "held back" or "lost". */
export function waitingReasonLine(reason: WaitingPayout["reason"]): string {
  return reason === "open_jobs"
    ? "Waiting until one of your other jobs is delivered"
    : "Waiting for your verification. Paid once you're verified.";
}

/**
 * The Money banner for someone printing from home (gridgo-api#412): the same
 * cap, but Verified asks for a barangay clearance or DTI permit and a TIN,
 * not a shop's business permit. `missing` is `verifiedMissing` from
 * `lib/homePrinter.ts`.
 */
export function homeMoneyVerifyBanner(
  v: ShopVerification,
  missing: { permit: boolean; tin: boolean },
): VerifyNotice | null {
  if (v.verified) return null;
  const cap = formatPhp(v.payoutCapMinor);
  const send = [
    missing.permit ? "your barangay clearance or DTI permit" : null,
    missing.tin ? "your TIN" : null,
  ].filter(Boolean);
  return {
    tone: "neutral",
    title: v.capReached ? `Payouts over ${cap} are waiting` : `Get Verified to unlock payouts over ${cap}`,
    body: [
      `${formatPhp(v.paidBeforeVerificationMinor)} of ${cap} paid out so far.`,
      send.length ? `Send ${send.join(" and ")} to get Verified.` : "GRIDGO is checking your papers.",
    ].join(" "),
    chip: null,
    action: send.length ? "Get Verified" : null,
  };
}
