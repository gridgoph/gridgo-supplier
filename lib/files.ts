import {
  createUploadTask,
  FileSystemUploadType,
} from "expo-file-system/legacy";

import * as api from "@/lib/api";

/**
 * Uploading a file to GRIDGO, told truthfully.
 *
 * Two things have to happen and they are not the same thing: the bytes leave
 * the phone, then the API confirms MinIO stored them and returns a `fileId`.
 * Progress reaching 100% is not success — only that id is. Nothing here ever
 * invents or reuses one.
 *
 * See `docs/STORAGE_API.md` in gridgo-api for the contract this implements.
 */

export type UploadStage =
  | "idle"
  | "uploading"
  | "processing"
  | "stored"
  | "attached"
  | "failed";

export type UploadItem = {
  /** Local id, stable for the whole attempt. */
  key: string;
  /** Device file URI. Streamed, never read into memory. */
  uri: string;
  fileName: string;
  /** iOS reports this unreliably; the server decides from magic bytes. */
  mimeType: string | null;
  sizeBytes: number | null;
  stage: UploadStage;
  /** 0–1 while bytes are moving. */
  progress: number;
  /** Server-issued id. Only set from a 201 response. */
  fileId: string | null;
  /** Names what went wrong and how to fix it. */
  error: string | null;
};

export function newUploadItem(input: {
  key: string;
  uri: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
}): UploadItem {
  return { ...input, stage: "idle", progress: 0, fileId: null, error: null };
}

/** `fulfilment_proof` and `artwork` share this ceiling; delivery photos are smaller. */
export const MAX_PROOF_BYTES = 200 * 1024 * 1024;

export function tooLargeMessage(sizeBytes: number, maxBytes = MAX_PROOF_BYTES): string {
  const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
  const limit = Math.round(maxBytes / (1024 * 1024));
  return `This file is ${mb} MB and the limit is ${limit} MB. Export it smaller and send it again.`;
}

export function isUploadBusy(items: UploadItem[]): boolean {
  return items.some((i) => i.stage === "uploading" || i.stage === "processing");
}

/** Files GRIDGO has confirmed it stored. Anything else does not count. */
export function storedUploads(items: UploadItem[]): UploadItem[] {
  return items.filter((i) => (i.stage === "stored" || i.stage === "attached") && i.fileId);
}

const PROOF_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp"]);
const PROOF_IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/**
 * Whether this upload is a photograph the shop should see as pixels.
 *
 * GRIDGO stores JPEG, PNG, WebP and PDF as evidence. A PDF is a document, not a
 * broken image — the type the phone reported wins, and the filename is only
 * consulted when it reported nothing.
 */
export function isProofImage(item: { mimeType: string | null; fileName: string }): boolean {
  const mime = (item.mimeType ?? "").toLowerCase().split(";")[0].trim();
  if (mime === "application/pdf") return false;
  if (mime && mime !== "application/octet-stream") return PROOF_IMAGE_TYPES.has(mime);
  return PROOF_IMAGE_EXT.test(item.fileName);
}

/** The type a non-photo proof shows, so a PDF is never a blank plate. */
export function proofDocumentKind(item: { mimeType: string | null; fileName: string }): string {
  const mime = (item.mimeType ?? "").toLowerCase().split(";")[0].trim();
  if (mime === "application/pdf" || item.fileName.toLowerCase().endsWith(".pdf")) return "PDF";
  return "File";
}

/** One line saying where an upload has actually got to. */
export function uploadStageLabel(item: UploadItem): string {
  switch (item.stage) {
    case "uploading":
      return `Sending ${Math.round(item.progress * 100)}%`;
    case "processing":
      return "Sent — GRIDGO is still saving it";
    case "stored":
      return "Saved. Ready to file";
    case "attached":
      return "Filed with GRIDGO";
    case "failed":
      return item.error ?? "Not saved";
    default:
      return "Ready to send";
  }
}

/** Every documented failure, mapped to a fix the shop can act on. */
const UPLOAD_MESSAGES: Record<string, string> = {
  invalid_file_purpose: "GRIDGO rejected this upload. Reopen the job and try again.",
  invalid_multipart: "The file did not arrive intact. Choose it again and resend.",
  unexpected_form_field: "GRIDGO rejected this upload. Reopen the job and try again.",
  file_required: "No file reached GRIDGO. Choose the file again.",
  file_empty: "That file is empty. Pick or retake it, then send it again.",
  filename_required:
    "That file has no name GRIDGO can read. Save it with a name ending in .jpg, .png or .pdf and try again.",
  file_too_large: "That file is over GRIDGO's size limit. Export it smaller and send it again.",
  request_body_too_large: "That request was too large. Try again with a smaller file.",
  multipart_required: "The file did not arrive intact. Choose it again and resend.",
  content_type_not_allowed:
    "GRIDGO stores JPEG, PNG, WebP and PDF. Export the evidence in one of those and try again.",
  purpose_media_type_not_allowed:
    "That file type is not accepted as evidence. Send a JPEG, PNG, WebP or PDF.",
  file_type_mismatch:
    "The file's name and its contents disagree, so GRIDGO cannot trust it. Export it again from your design app.",
  heic_not_supported:
    "iPhone HEIC photos are not supported. Set your camera to Most Compatible, or export the shot as JPEG.",
  invalid_milestone_code:
    "That part of the job does not take your evidence. Close this and pick one of the parts listed on the job.",
  milestone_not_found:
    "That part of the job is no longer there. Pull down to refresh and try again.",
  file_not_ready: "That upload did not finish. Send the file again.",
  file_already_attached:
    "That file already backs another part of the job. Take a new photo for this one.",
  file_not_found: "GRIDGO no longer has that file. Send it again.",
  order_not_found: "This job is no longer on your floor. It may have been rematched.",
  storage_object_missing: "GRIDGO lost track of that file. Send it again.",
  storage_object_mismatch: "That file arrived damaged. Send it again.",
  forbidden:
    "This part of the job is not yours to evidence — the rider files the delivery. Open the job to see what is waiting on you.",
  minio_unavailable:
    "GRIDGO's file storage is not responding. Nothing was lost — try sending the file again in a moment.",
  storage_initializing:
    "GRIDGO's file storage is still starting up. Wait a few seconds and send the file again.",
};

export type UploadResult =
  | { ok: true; fileId: string }
  | {
      ok: false;
      error: string;
      /**
       * The API's own failure code, for the one caller that has to tell two
       * failures apart rather than only show a sentence: a purpose the platform
       * does not know yet is a route that has not landed, not a bad file.
       * Never shown on screen.
       */
      code?: string;
    };

/**
 * Stream one file to `POST /files`.
 *
 * The native uploader sends straight from the device URI, so a 200 MB proof is
 * never read into JavaScript memory — that is what crashes mid-range Android
 * phones. Only `purpose` and `file` are sent; the contract rejects any other
 * form field.
 */
export async function uploadFile(
  item: UploadItem,
  purpose: api.StoredFile["purpose"],
  onProgress: (fraction: number) => void,
): Promise<UploadResult> {
  let token: string | null;
  try {
    token = await api.getAuthToken();
  } catch {
    return {
      ok: false,
      error: "The file could not be sent. Check this device's connection and try again.",
    };
  }
  if (!token) {
    return { ok: false, error: "Your session ended. Sign in again to send this file." };
  }

  try {
    const task = createUploadTask(
      `${api.getApiBase()}/files`,
      item.uri,
      {
        httpMethod: "POST",
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: "file",
        // Left as reported. The API decides from magic bytes, and iOS is
        // routinely wrong here.
        mimeType: item.mimeType ?? undefined,
        parameters: { purpose },
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      },
      (data) => {
        if (!data.totalBytesExpectedToSend) return;
        onProgress(Math.min(1, data.totalBytesSent / data.totalBytesExpectedToSend));
      },
    );

    const response = await task.uploadAsync();
    if (!response) {
      return { ok: false, error: "The upload stopped before it finished. Send the file again." };
    }

    const body = parseJson(response.body);
    if (response.status === 201) {
      const fileId = readFileId(body);
      if (!fileId) {
        // A 201 without an id means nothing is provably stored.
        return {
          ok: false,
          error: "GRIDGO did not confirm it saved the file. Send it again.",
        };
      }
      return { ok: true, fileId };
    }

    return {
      ok: false,
      error: messageFor(body, response.status),
      code: typeof body?.error === "string" ? body.error : undefined,
    };
  } catch {
    return {
      ok: false,
      error: "The file could not be sent. Check this device's connection and try again.",
    };
  }
}

/** Turn a file-route failure into a sentence naming the fix. */
export function messageFor(body: Record<string, unknown> | null, status: number): string {
  const code = typeof body?.error === "string" ? body.error : "";
  const known = UPLOAD_MESSAGES[code];
  if (known) return known;
  if (status === 401) return "Your session ended. Sign in again to send this file.";
  if (status >= 500) return "GRIDGO could not handle this file. Try again in a moment.";
  return "GRIDGO could not accept this file. Try again, or send a different export.";
}

function parseJson(text: string | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readFileId(body: Record<string, unknown> | null): string | null {
  const file = body?.file;
  if (typeof file === "object" && file && "fileId" in file) {
    const id = (file as { fileId: unknown }).fileId;
    if (typeof id === "string" && id) return id;
  }
  return null;
}

export type StorageAvailability = "checking" | "available" | "unavailable";

/**
 * Whether GRIDGO can store files right now.
 *
 * A build without file support omits `storage` from `/health` entirely, so a
 * missing field is treated as unavailable rather than assumed to work.
 */
export async function probeStorage(): Promise<StorageAvailability> {
  try {
    const result = await api.health();
    const status = result.storage?.status;
    if (status === "available") return "available";
    if (status === "checking" || status === "initializing") return "checking";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}
