/**
 * GRIDGO's legal documents, the agreements a shop makes, and the privacy
 * requests it can send (gridgo-api `docs/LEGAL_API.md`, report 879B25FC).
 *
 * The rules live here so screens only draw them:
 * - which documents apply, the agreement gate and the library name, by slot;
 * - the exact bodies an agreement is recorded with — always the version IDs
 *   the shop was shown, never a hard-coded "version 1";
 * - how a version, a placeholder, a penalty clause and a privacy request are
 *   worded, and why each capture in the app asks for what it asks.
 *
 * Text is plain text. Nothing here ever turns a document into HTML.
 */

import {
  ApiError,
  type EnrollmentConsentBody,
  type LegalAcceptanceContext,
  type LegalVersion,
  type PrivacyRequest,
  type PrivacyRequestKind,
} from "@/lib/api";
import { NO_MONEY_TAKEN } from "@/lib/performance";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";
import type { Href } from "expo-router";

export const TERMS_ID = "terms-of-service";
export const PRIVACY_ID = "privacy-notice";
export const SUPPLIER_AGREEMENT_ID = "supplier-agreement";

/** What a shop agrees to before GRIDGO opens its account. */
export const APPLY_DOCUMENT_IDS = [TERMS_ID, PRIVACY_ID, SUPPLIER_AGREEMENT_ID] as const;

/**
 * The library's reading order: the shop's own agreement first, because it is
 * the one that governs its money, then the two everyone agrees to, then the
 * policies. Slots GRIDGO adds later follow, by title.
 */
const LIBRARY_ORDER = [
  SUPPLIER_AGREEMENT_ID,
  TERMS_ID,
  PRIVACY_ID,
  "acceptable-use",
  "age-policy",
  "cookie-notice",
];

export function libraryOrder<T extends Pick<LegalVersion, "documentId" | "title">>(
  documents: readonly T[],
): T[] {
  const rank = (id: string) => {
    const at = LIBRARY_ORDER.indexOf(id);
    return at === -1 ? LIBRARY_ORDER.length : at;
  };
  return [...documents].sort(
    (a, b) => rank(a.documentId) - rank(b.documentId) || a.title.localeCompare(b.title),
  );
}

/** The reader for exactly this version — a stable link to what was agreed to. */
export function legalDocumentHref(doc: Pick<LegalVersion, "id">): Href {
  return { pathname: "/legal/[versionId]", params: { versionId: doc.id } } as Href;
}

export function documentFor(
  documents: readonly LegalVersion[] | null | undefined,
  documentId: string,
): LegalVersion | null {
  return documents?.find((doc) => doc.documentId === documentId) ?? null;
}

/** Terms, Privacy and the Supplier Agreement, or null while any is missing. */
export function applyDocuments(
  documents: readonly LegalVersion[] | null | undefined,
): LegalVersion[] | null {
  const found = APPLY_DOCUMENT_IDS.map((id) => documentFor(documents, id));
  return found.every(Boolean) ? (found as LegalVersion[]) : null;
}

/** "Terms of Service, Privacy Notice and Supplier Agreement". */
export function joinTitles(documents: readonly Pick<LegalVersion, "title">[]): string {
  const titles = documents.map((doc) => doc.title);
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

const DATE_PARTS = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "9 Oct 2026" in Davao time, whatever order the runtime's locale data prefers. */
export function legalDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const parts = Object.fromEntries(
    DATE_PARTS.formatToParts(at).map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}`;
}

/** "Version 2, in effect from 9 Oct 2026". */
export function versionLine(doc: Pick<LegalVersion, "version" | "effectiveAt">): string {
  const date = legalDate(doc.effectiveAt);
  return date ? `Version ${doc.version}, in effect from ${date}` : `Version ${doc.version}`;
}

export type LegalStatusLook = { tone: StatusTone; label: string; icon: StatusIconName };

/**
 * A placeholder is said in words every time it is drawn. Agreeing to one does
 * not stand in for agreeing to the real text, and the shop should know which
 * it is reading.
 */
export function legalStatusLook(doc: Pick<LegalVersion, "placeholder" | "status">): LegalStatusLook {
  if (doc.placeholder || doc.status === "placeholder") {
    return { tone: "warning", label: "Placeholder", icon: "square-pen" };
  }
  return { tone: "success", label: "In effect", icon: "circle-check" };
}

export const PLACEHOLDER_NOTE =
  "This is placeholder text. GRIDGO will publish the reviewed document here, and ask you to agree to it then.";

/**
 * The change note worth showing: a later version's own summary. The launch
 * placeholders all say "Launch placeholder", which tells a reader nothing the
 * Placeholder chip does not.
 */
export function changeNote(doc: Pick<LegalVersion, "version" | "changeSummary">): string | null {
  const summary = doc.changeSummary?.trim();
  if (!summary || doc.version <= 1) return null;
  return summary;
}

export type PenaltyNote = { promise: string; clause: string };

/**
 * The one clause in this library that could move a shop's money, said at the
 * moment the shop agrees. The clause is part of the agreement, but during the
 * pilot GRIDGO assesses no new late deduction, even under an accepted version
 * that allows one (gridgo-api `docs/SUPPLIER_PERFORMANCE_API.md`, "Warnings
 * only"). So the shop hears the Performance page's promise first, and agreeing
 * is never worded as what turns deductions on.
 */
export function penaltyNote(doc: Pick<LegalVersion, "penalties" | "documentId">): PenaltyNote | null {
  if (!doc.penalties) return null;
  return {
    promise: NO_MONEY_TAKEN,
    clause:
      "This version includes a clause that lets GRIDGO deduct from a job's pay when production runs late. GRIDGO does not use it during the current pilot: a late finish gets a warning, and agreeing does not change that.",
  };
}

// ---------------------------------------------------------------------------
// Agreeing at apply
// ---------------------------------------------------------------------------

/**
 * The apply answers. The agreement box carries the age declaration too: a
 * Supplier Agreement is a business contract, so the person sending it says
 * they are an adult who can make it — GRIDGO never infers age.
 */
export type ApplyConsent = { agreed: boolean; marketing: boolean };

export const EMPTY_APPLY_CONSENT: ApplyConsent = { agreed: false, marketing: false };

export function applyAgreementLabel(documents: readonly Pick<LegalVersion, "title">[] | null): string {
  const titles = documents?.length
    ? joinTitles(documents)
    : "Terms of Service, Privacy Notice and Supplier Agreement";
  return `I am 18 or older and agree, for this shop, to the ${titles}`;
}

export function enrollmentConsentBody(
  versionIds: string[],
  consent: ApplyConsent,
  context: LegalAcceptanceContext,
): EnrollmentConsentBody {
  return {
    accepted: true,
    versionIds,
    method: "checkbox",
    junior: false,
    marketing: consent.marketing,
    ...context,
  };
}

export { isLegalRefusal, isLegalVersionChanged } from "@/lib/apiErrors";

export const LEGAL_VERSION_CHANGED =
  "GRIDGO published a newer version while you were reading. Read it, then agree again.";

export const APPLY_CONSENT_REFUSED =
  "GRIDGO has newer terms than the ones on this screen. Read them again, tick the box, then send.";

/** An API without the legal library answers its routes 404. */
export function isLegalUnsupported(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

// ---------------------------------------------------------------------------
// The agreement screen and notices
// ---------------------------------------------------------------------------

/** See `store/legalConsent.ts` for what each state means. */
export type LegalGateStatus = "unknown" | "clear" | "blocked";

function changed(pending: readonly Pick<LegalVersion, "version">[]): boolean {
  return pending.some((doc) => doc.version > 1);
}

/** "Agree to GRIDGO's terms", or "GRIDGO's terms have changed" for a later version. */
export function gateHeading(pending: readonly Pick<LegalVersion, "version">[]): string {
  return changed(pending) ? "GRIDGO's terms have changed" : "Agree to GRIDGO's terms";
}

export function gateBody(pending: readonly Pick<LegalVersion, "version">[]): string {
  return changed(pending)
    ? "Read what changed, then agree to keep taking jobs. Your jobs and earnings are safe while you read."
    : "Your shop works with GRIDGO under these. Read them, then agree to open your floor. Your jobs and earnings are safe while you read.";
}

/** Notices this phone has not shown yet. */
export function unseenNotices(
  notices: readonly LegalVersion[],
  seen: readonly string[],
): LegalVersion[] {
  return notices.filter((doc) => !seen.includes(doc.id));
}

export function noticeHeading(notices: readonly Pick<LegalVersion, "title" | "version">[]): string {
  // Only what actually changed is called an update; a policy the shop has
  // simply never opened is "to read", and the line underneath names them all.
  const updated = notices.filter((doc) => doc.version > 1);
  if (updated.length === 1) return `GRIDGO updated its ${updated[0].title}`;
  if (updated.length > 1) return `GRIDGO updated ${updated.length} policies`;
  return notices.length === 1
    ? `New to read: ${notices[0].title}`
    : `${notices.length} GRIDGO policies to read`;
}

/** The card's line: which ones, and that nothing is asked of the shop. */
export function noticeBody(notices: readonly Pick<LegalVersion, "title" | "documentId">[]): string {
  const which = notices.length > 1 ? `${joinTitles(libraryOrder(notices))}. ` : "";
  const where = notices.length > 1 ? "They stay" : "It stays";
  return `${which}Nothing to agree to. ${where} in Account, under Legal & Privacy.`;
}

// ---------------------------------------------------------------------------
// Privacy requests
// ---------------------------------------------------------------------------

export type PrivacyKindCopy = {
  title: string;
  /** The row's line on Your data. */
  detail: string;
  /** The request screen's opening paragraph. */
  explain: string;
  detailsLabel: string;
  detailsPlaceholder: string;
  /** True when the request means little without the details. */
  detailsRequired: boolean;
};

export const PRIVACY_KINDS: Record<Exclude<PrivacyRequestKind, "deletion">, PrivacyKindCopy> = {
  access: {
    title: "See my data",
    detail: "Ask for a copy of the personal data GRIDGO holds about you",
    explain:
      "GRIDGO checks it is you, then sends you a copy of the personal data it holds about you: your account, your shop's details and pin, your jobs, payouts and messages.",
    detailsLabel: "Anything in particular? (optional)",
    detailsPlaceholder: "For example, only your payouts from this year",
    detailsRequired: false,
  },
  correction: {
    title: "Correct my data",
    detail: "Tell GRIDGO about something it has wrong",
    explain:
      "Say what is wrong and what it should be. Your shop name, contact person and number you can fix yourself in Your shop details; use this for anything else.",
    detailsLabel: "What should GRIDGO correct?",
    detailsPlaceholder: "For example: the payout name on job GG-1234 is misspelled",
    detailsRequired: true,
  },
};

export const DELETION_ROW = {
  title: "Delete my account",
  detail: "Ask GRIDGO to delete your shop account and personal data",
};

/**
 * Said wherever deletion is offered and once a request is sent: the records
 * GRIDGO must keep, and why, so "deleted" never promises more than it can.
 */
export const RETENTION_NOTE =
  "Some records stay, because the law requires GRIDGO to keep them: invoices and receipts for the jobs you made, payout records, and the record of what you agreed to. GRIDGO tells you which ones it kept when it finishes your request.";

export const PRIVACY_REQUEST_FAILED =
  "Your request did not reach GRIDGO. Check this phone's connection and try again.";

export function privacyKindTitle(kind: string): string {
  if (kind === "deletion") return DELETION_ROW.title;
  if (kind === "access" || kind === "correction") return PRIVACY_KINDS[kind].title;
  return "Privacy request";
}

export function privacyStatusLook(status: string): LegalStatusLook {
  switch (status) {
    case "in_progress":
      return { tone: "info", label: "In progress", icon: "clock" };
    case "completed":
      return { tone: "success", label: "Done", icon: "circle-check" };
    case "rejected":
      return { tone: "error", label: "Declined", icon: "circle-x" };
    default:
      return { tone: "neutral", label: "Received", icon: "clock" };
  }
}

/** "Sent 9 Oct 2026, answer due by 24 Oct 2026", or the close when there is one. */
export function privacyRequestLine(
  request: Pick<PrivacyRequest, "status" | "requestedAt" | "dueAt" | "updatedAt">,
): string {
  const sent = legalDate(request.requestedAt);
  const closedOrDue =
    request.status === "completed" || request.status === "rejected"
      ? (() => {
          const closed = legalDate(request.updatedAt);
          return closed ? `closed ${closed}` : null;
        })()
      : (() => {
          const due = legalDate(request.dueAt);
          return due ? `answer due by ${due}` : null;
        })();
  return [sent ? `Sent ${sent}` : null, closedOrDue].filter(Boolean).join(", ");
}

/** An open request of this kind — a second one is allowed, but said first. */
export function openRequestOf(
  requests: readonly PrivacyRequest[],
  kind: string,
): PrivacyRequest | null {
  return (
    requests.find(
      (request) =>
        request.kind === kind && (request.status === "pending" || request.status === "in_progress"),
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Why we ask
// ---------------------------------------------------------------------------

/**
 * One line per capture, saying what that capture is for — specific to it,
 * never "to improve our services". Kept here so the same capture says the
 * same thing wherever it appears.
 */
export const WHY_WE_ASK = {
  phone: "We use this number so Operations and the rider collecting a job can reach you.",
  shopPin: "We use this address to send riders to your counter and to work out delivery fees.",
  shopPhoto: "This photo shows clients and riders which shop they are dealing with.",
  papers: "We use these papers only to check your shop is a real, registered business.",
  samplePhoto: "Clients see these photos on your board when choosing a shop.",
  progressPhoto: "This photo records that the job is in production. The client sees it on their order.",
  packedPhoto: "This photo records how the job was packed, for the check with the rider.",
  finishedPhoto:
    "GRIDGO checks these photos before a rider is called. The client sees them on their order, and they are kept for any later question about the job.",
  proofPhoto: "These photos are your evidence for this part of the job's pay. The GRIDGO Team reviews them.",
  payoutQr: "We use this QR only to pay your shop.",
  chatPhoto: "Photos you send here are seen by the people in this chat and kept with the job.",
} as const;
