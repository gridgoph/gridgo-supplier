import * as ImagePicker from "expo-image-picker";

import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { newUploadItem, uploadFile } from "@/lib/files";
import { isPhoneish } from "@/lib/onboardingSteps";
import { takePhoto, type PickOutcome } from "@/lib/pickFile";
import type { Option } from "@/components/controls/OptionList";

/**
 * Where the shop gets paid — the record behind "Where you get paid" on Account.
 *
 * When a job is done, a person in Operations opens a wallet app and scans the
 * shop's receiving QR: the same laminated GCash or Maya plate that sits on the
 * counter. This module holds that plate and the words that go with it, in the
 * same shape as `lib/shopProfile.ts` so a shop that has corrected its name
 * already knows how this screen behaves.
 *
 * Two of the outcomes are not failures. **Not open yet** means GRIDGO has no
 * route for this on the platform the app is pointed at; it is said plainly
 * rather than shown as a red failure. **Stale** means the account moved while
 * the screen was open, and the screen offers the latest rather than overwrite
 * what it cannot see.
 */

export type PayoutField = "provider" | "accountName" | "accountNumber" | "institution" | "qr";

export type PayoutOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "not_open_yet" }
  | { status: "stale" }
  /** `field` is set when GRIDGO named the one detail it would not accept. */
  | { status: "failed"; message: string; field?: PayoutField };

export const PAYOUT_NOT_OPEN_YET =
  "GRIDGO has not opened payout accounts on this app yet. Nothing here is lost — check again shortly, and tell Operations where to send your payout meanwhile.";

export const PAYOUT_STALE =
  "Your payout account changed somewhere else while this screen was open. Load the latest so nothing you cannot see is overwritten, then make your change again.";

/** 404/405 mean the route is not there. Anything else is a real failure. */
function isRouteAbsent(error: unknown): boolean {
  return error instanceof api.ApiError && (error.status === 404 || error.status === 405);
}

/* --------------------------------------------------------------------------
   The providers a shop can choose
   -------------------------------------------------------------------------- */

export const PROVIDER_OPTIONS: readonly Option<api.PayoutProvider>[] = [
  { value: "gcash", label: "GCash", detail: "Operations scans your GCash QR and sends to that number." },
  { value: "maya", label: "Maya", detail: "Operations scans your Maya QR and sends to that number." },
  { value: "bank", label: "Bank transfer", detail: "Your bank's QR, or the account number below." },
  { value: "other", label: "Another wallet", detail: "Any other wallet with a receiving QR." },
];

export function providerLabel(provider: api.PayoutProvider): string {
  return PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? provider;
}

/** GCash and Maya accounts are mobile numbers; a bank account is whatever the bank says. */
export function isWallet(provider: api.PayoutProvider | null): boolean {
  return provider === "gcash" || provider === "maya";
}

/* --------------------------------------------------------------------------
   The draft on screen
   -------------------------------------------------------------------------- */

export type PayoutDraft = {
  provider: api.PayoutProvider | null;
  accountName: string;
  accountNumber: string;
  institution: string;
  /**
   * The plate. `fileId` is what GRIDGO holds or has just stored; `localUri` is
   * the picture as picked on this phone, shown before the round trip lands.
   * `removed` marks a saved plate the shop asked to take down.
   */
  qr: { fileId: string | null; localUri: string | null; removed: boolean };
};

export function draftFromAccount(account: api.PayoutAccount | null): PayoutDraft {
  return {
    provider: account?.provider ?? null,
    accountName: account?.accountName ?? "",
    accountNumber: account?.accountNumber ?? "",
    institution: account?.institution ?? "",
    qr: { fileId: account?.qr?.fileId ?? null, localUri: null, removed: false },
  };
}

/**
 * Only what actually moved.
 *
 * A patch carrying every field would send GRIDGO an account name the shop
 * never touched, which is the write that loses somebody else's correction
 * even when the version still matches. A new account sends everything.
 */
export function payoutPatch(
  account: api.PayoutAccount | null,
  draft: PayoutDraft,
): api.PayoutAccountPatch {
  const patch: api.PayoutAccountPatch = {};
  const provider = draft.provider;
  const accountName = draft.accountName.trim();
  const accountNumber = draft.accountNumber.trim();
  const institution = draft.institution.trim();

  if (provider && provider !== account?.provider) patch.provider = provider;
  if (accountName !== (account?.accountName ?? "")) patch.accountName = accountName;
  if (accountNumber !== (account?.accountNumber ?? "")) patch.accountNumber = accountNumber;
  if (institution !== (account?.institution ?? "")) patch.institution = institution;

  const savedQr = account?.qr?.fileId ?? null;
  if (draft.qr.removed && savedQr) patch.qrFileId = null;
  else if (draft.qr.fileId && draft.qr.fileId !== savedQr) patch.qrFileId = draft.qr.fileId;

  return patch;
}

export function hasPayoutChanges(account: api.PayoutAccount | null, draft: PayoutDraft): boolean {
  return Object.keys(payoutPatch(account, draft)).length > 0;
}

/* --------------------------------------------------------------------------
   What is still wrong with it
   -------------------------------------------------------------------------- */

export type PayoutProblems = Partial<Record<PayoutField, string>>;

/**
 * Caught before a round trip. The plate is not required: a shop can give a
 * number now and photograph the plate when it is back at the counter.
 */
export function payoutProblems(draft: PayoutDraft): PayoutProblems {
  const problems: PayoutProblems = {};
  if (!draft.provider) {
    problems.provider = "Choose where you want to be paid.";
  }
  if (!draft.accountName.trim()) {
    problems.accountName = "Enter the name the wallet shows when someone pays you.";
  }
  const number = draft.accountNumber.trim();
  if (number && isWallet(draft.provider) && !isPhoneish(number)) {
    problems.accountNumber = "Enter the mobile number this wallet is registered to, like 0917 123 4567.";
  }
  if (draft.provider === "bank" && !draft.institution.trim()) {
    problems.institution = "Name the bank so Operations picks the right one.";
  }
  return problems;
}

/**
 * GRIDGO's refusal, in this app's words rather than the server's.
 */
const REFUSED: Record<PayoutField, string> = {
  provider: "GRIDGO would not accept that choice. Pick GCash, Maya, a bank, or another wallet.",
  accountName: "GRIDGO would not accept that name. Use the name the wallet shows when someone pays you.",
  accountNumber:
    "GRIDGO would not accept that number. For GCash or Maya, enter the mobile number the wallet is registered to.",
  institution: "GRIDGO would not accept that bank name. Name the bank as it appears on your account.",
  qr: "GRIDGO could not use that picture as your QR. Take the photo again and save it.",
};

function refusedField(error: unknown): PayoutField | null {
  if (!(error instanceof api.ApiError)) return null;
  const body = error.body;
  if (typeof body !== "object" || !body) return null;
  const record = body as Record<string, unknown>;
  if (record.error === "invalid_payout_qr" || record.error === "file_already_attached") return "qr";
  if (record.error !== "invalid_payout_account") return null;
  const field = record.field;
  return field === "provider"
    || field === "accountName"
    || field === "accountNumber"
    || field === "institution"
    ? field
    : null;
}

/* --------------------------------------------------------------------------
   The calls
   -------------------------------------------------------------------------- */

export async function loadPayoutAccount(): Promise<PayoutOutcome<api.PayoutAccount | null>> {
  try {
    return { status: "ok", value: await api.getPayoutAccount() };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    return {
      status: "failed",
      message: humanizeApiError(error, offlineMessage("load your payout account")),
    };
  }
}

/**
 * Save what changed, against the version it was read at. A refusal naming
 * one field comes back on that field.
 */
export async function savePayoutAccount(
  version: number | null,
  patch: api.PayoutAccountPatch,
): Promise<PayoutOutcome<api.PayoutAccount>> {
  try {
    return { status: "ok", value: await api.updatePayoutAccount(version, patch) };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    if (error instanceof api.ApiError && error.status === 409) {
      const field = refusedField(error);
      if (field) return { status: "failed", message: REFUSED[field], field };
      return { status: "stale" };
    }
    const field = refusedField(error);
    if (field) return { status: "failed", message: REFUSED[field], field };
    return {
      status: "failed",
      message: humanizeApiError(error, offlineMessage("save your payout account")),
    };
  }
}

/* --------------------------------------------------------------------------
   The plate
   -------------------------------------------------------------------------- */

export type PickedQr = {
  uri: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

/** GRIDGO keeps a receiving QR under 5 MB; a phone photo is well under that. */
export const MAX_QR_BYTES = 5 * 1024 * 1024;

export async function takeQrPhoto(): Promise<PickOutcome> {
  return takePhoto();
}

/** Pictures only. A QR saved as a PDF would not scan from a screen anyway. */
export async function chooseQrPicture(): Promise<PickOutcome> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.9,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return { ok: false, cancelled: true };
  return {
    ok: true,
    document: {
      uri: asset.uri,
      fileName: asset.fileName || "payout-qr.jpg",
      mimeType: asset.mimeType ?? null,
      sizeBytes: asset.fileSize ?? null,
    },
  };
}

export type QrUploadOutcome =
  | { status: "ok"; fileId: string }
  | { status: "not_open_yet" }
  | { status: "failed"; message: string };

/**
 * Send the picked plate to GRIDGO's file store. Nothing is bound until the
 * shop saves; a picture sent and then abandoned is the shop's own to delete
 * and never reaches Operations.
 */
export async function sendQrPicture(
  picked: PickedQr,
  onProgress: (fraction: number) => void = () => {},
): Promise<QrUploadOutcome> {
  if (picked.sizeBytes != null && picked.sizeBytes > MAX_QR_BYTES) {
    return {
      status: "failed",
      message: "That picture is over 5 MB. Take a plain photo of the plate instead of a scan.",
    };
  }
  const item = newUploadItem({ key: "payout-qr", ...picked });
  const result = await uploadFile(item, "supplier_payout_qr", onProgress);
  if (result.ok) return { status: "ok", fileId: result.fileId };
  if (result.code === "invalid_file_purpose") return { status: "not_open_yet" };
  return { status: "failed", message: result.error };
}
