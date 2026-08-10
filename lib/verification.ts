import * as api from "@/lib/api";
import { messageFor, uploadFile, type UploadItem } from "@/lib/files";
import type { DocumentKind, PickedDocument } from "@/store/signupDraft";
import type { ShopPin } from "@/lib/shopLocation";

/**
 * The two things a shop does for its own account, behind one thin adapter.
 *
 * The platform is adding both routes in parallel with this app — a supplier
 * moving its own shop pin, and attaching accreditation papers to its own
 * pending account. Until they land, calling them answers 404, and a screen that
 * showed a shop a red failure for a route the platform has not opened yet would
 * be blaming the shop for GRIDGO's schedule.
 *
 * So a missing route is a third outcome, not an error: the work is kept, the
 * screen says what actually happens next (Operations confirms it during
 * accreditation), and nothing claims to have been sent that was not.
 */

export type AccountWriteOutcome =
  | { status: "saved" }
  | { status: "not_open_yet" }
  | { status: "failed"; message: string };

/** 404/405 mean the route is not there. Anything else is a real failure. */
function isRouteAbsent(error: unknown): boolean {
  return error instanceof api.ApiError && (error.status === 404 || error.status === 405);
}

/**
 * What a shop is told when GRIDGO has not opened a route yet. Names no status
 * code and makes no promise the platform has not made.
 */
export const PIN_NOT_OPEN_YET =
  "GRIDGO has not opened pin editing to shops yet. Your pin is unchanged — ask Operations to move it, and they will confirm it with you.";

export const DOCUMENTS_NOT_OPEN_YET =
  "GRIDGO has not opened document upload to shops yet. Operations will ask you for these directly while they check your account.";

/** Move the shop's own pin. */
export async function saveShopLocation(pin: ShopPin): Promise<AccountWriteOutcome> {
  try {
    await api.updateShopLocation(pin);
    return { status: "saved" };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    if (error instanceof api.ApiError) {
      return {
        status: "failed",
        message:
          error.status >= 500
            ? "GRIDGO could not save your pin just now. Try again in a moment."
            : "GRIDGO would not accept that pin. Check it is on your own door in Davao City, then try again.",
      };
    }
    return {
      status: "failed",
      message: "Cannot reach GRIDGO from this device. Check the connection and try again.",
    };
  }
}

/* --------------------------------------------------------------------------
   Accreditation papers
   -------------------------------------------------------------------------- */

export type VerificationDocument = {
  kind: DocumentKind;
  /** What the shop is being asked for, in the words Operations uses. */
  title: string;
  /** Why GRIDGO wants it — a constraint explained before it is hit. */
  detail: string;
  /** Whether Operations treats this as required for a first approval. */
  expected: boolean;
};

export const VERIFICATION_DOCUMENTS: readonly VerificationDocument[] = [
  {
    kind: "business_permit",
    title: "Business permit",
    detail: "Your current Davao City mayor's permit, or the barangay permit if that is what you hold.",
    expected: true,
  },
  {
    kind: "valid_id",
    title: "Valid ID of the owner",
    detail: "Any government ID with a photo, for the person named as the contact.",
    expected: true,
  },
  {
    kind: "sample_work",
    title: "A photo of your work",
    detail: "One print you are proud of. Operations uses it to sanity-check what you ranked first.",
    expected: false,
  },
] as const;

export function documentDefinition(kind: DocumentKind): VerificationDocument {
  return VERIFICATION_DOCUMENTS.find((d) => d.kind === kind) ?? VERIFICATION_DOCUMENTS[0];
}

export type DocumentSendResult = {
  kind: DocumentKind;
  outcome: AccountWriteOutcome;
};

/**
 * Send one picked document.
 *
 * The bytes go through the ordinary streamed upload — a permit photographed on
 * a phone is the same 8 MB JPEG as any other, and reading it into memory is
 * what kills mid-range Android. Only a stored `fileId` counts as sent.
 */
export async function sendDocument(
  kind: DocumentKind,
  picked: PickedDocument,
  onProgress: (fraction: number) => void = () => undefined,
): Promise<AccountWriteOutcome> {
  const item: UploadItem = {
    key: kind,
    uri: picked.uri,
    fileName: picked.fileName,
    mimeType: picked.mimeType,
    sizeBytes: picked.sizeBytes,
    stage: "idle",
    progress: 0,
    fileId: null,
    error: null,
  };

  const uploaded = await uploadFile(item, "verification_document", onProgress);
  if (!uploaded.ok) {
    // The upload route exists; a purpose it does not know yet is the same
    // "not open" fact as a missing attach route.
    return uploaded.code === "invalid_file_purpose"
      ? { status: "not_open_yet" }
      : { status: "failed", message: uploaded.error };
  }

  try {
    await api.attachVerificationDocument(uploaded.fileId, kind);
    return { status: "saved" };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    const body =
      error instanceof api.ApiError && typeof error.body === "object" && error.body
        ? (error.body as Record<string, unknown>)
        : null;
    const status = error instanceof api.ApiError ? error.status : 0;
    return { status: "failed", message: messageFor(body, status) };
  }
}

/** Send everything the shop picked, one at a time. */
export async function sendDocuments(
  documents: Partial<Record<DocumentKind, PickedDocument>>,
): Promise<DocumentSendResult[]> {
  const out: DocumentSendResult[] = [];
  for (const definition of VERIFICATION_DOCUMENTS) {
    const picked = documents[definition.kind];
    if (!picked) continue;
    out.push({ kind: definition.kind, outcome: await sendDocument(definition.kind, picked) });
  }
  return out;
}

/**
 * One sentence about how a batch of documents went — the shop's account already
 * exists by this point, so nothing here is allowed to read as a failed sign-up.
 */
export function summariseDocumentSend(results: DocumentSendResult[]): string | null {
  if (!results.length) return null;
  if (results.every((r) => r.outcome.status === "saved")) return null;
  if (results.every((r) => r.outcome.status === "not_open_yet")) return DOCUMENTS_NOT_OPEN_YET;

  const failed = results.filter((r) => r.outcome.status === "failed");
  if (!failed.length) return DOCUMENTS_NOT_OPEN_YET;
  const names = failed.map((r) => documentDefinition(r.kind).title.toLowerCase()).join(" and ");
  return `Your account is open, but GRIDGO did not get your ${names}. Send it again from your account screen — Operations cannot accredit you without it.`;
}
