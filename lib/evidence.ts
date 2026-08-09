import {
  createUploadTask,
  FileSystemUploadType,
} from "expo-file-system/legacy";

import * as api from "@/lib/api";

/**
 * Self-QC photo evidence.
 *
 * A file is not uploaded until GRIDGO returns its id. Every stage below is a
 * real stage of that journey — the bytes moving, then the server finishing the
 * job after the last byte lands — so the shop is never shown a tick for
 * something that has not been stored.
 *
 * Transport lives in `uploadEvidence` (native only, streamed from the file URI
 * so a 12 MP photo never has to fit in JavaScript memory).
 */

export type EvidenceStage =
  | "idle"
  | "uploading"
  | "processing"
  | "stored"
  | "failed";

export type EvidenceItem = {
  /** Local id, stable for the whole attempt. */
  key: string;
  /** Device file URI. */
  uri: string;
  fileName: string;
  /** iOS often reports nothing useful here; the server decides. */
  mimeType: string | null;
  sizeBytes: number | null;
  stage: EvidenceStage;
  /** 0–1 while bytes are moving. */
  progress: number;
  /** Server-issued attachment id. Only set once `stage` is `stored`. */
  attachmentId: string | null;
  /** Names what went wrong and how to fix it. */
  error: string | null;
};

export function newEvidenceItem(input: {
  key: string;
  uri: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
}): EvidenceItem {
  return {
    ...input,
    stage: "idle",
    progress: 0,
    attachmentId: null,
    error: null,
  };
}

/** Largest file the storage service accepts. */
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export function tooLargeMessage(sizeBytes: number): string {
  const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
  return `This photo is ${mb} MB and the limit is 10 MB. Retake it at a lower resolution, or pick a smaller file.`;
}

/** Only stored evidence counts towards the self-QC record. */
export function storedEvidence(items: EvidenceItem[]): EvidenceItem[] {
  return items.filter((item) => item.stage === "stored" && item.attachmentId);
}

export function isEvidenceBusy(items: EvidenceItem[]): boolean {
  return items.some((item) => item.stage === "uploading" || item.stage === "processing");
}

/** One line saying where an upload has actually got to. */
export function evidenceStageLabel(item: EvidenceItem): string {
  switch (item.stage) {
    case "uploading":
      return `Sending ${Math.round(item.progress * 100)}%`;
    case "processing":
      return "Sent — GRIDGO is still saving it";
    case "stored":
      return "Saved to this job";
    case "failed":
      return item.error ?? "Not saved";
    default:
      return "Ready to send";
  }
}

export type StorageAvailability = "checking" | "available" | "unavailable";

/**
 * Whether this API build can store files at all.
 *
 * Older API builds have no storage service and no `/attachments` route; they
 * simply omit `storage` from `/health`. Treating a missing field as
 * unavailable is what keeps the screen honest instead of failing at the moment
 * a shop tries to save a photo.
 */
export async function probeStorage(): Promise<StorageAvailability> {
  try {
    const result = await api.health();
    return result.storage?.status ?? "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Failures the storage service names, mapped to a fix the shop can act on. */
const UPLOAD_MESSAGES: Record<string, string> = {
  file_too_large:
    "That photo is over the 10 MB limit. Retake it at a lower resolution and send it again.",
  content_type_not_allowed:
    "GRIDGO stores JPEG, PNG, WebP and PDF. Save this as a JPEG and try again.",
  file_empty: "That file came through empty. Take the photo again and send it.",
  file_required: "No photo reached GRIDGO. Choose the photo again.",
  minio_unavailable:
    "GRIDGO's file storage is not responding. Your checks are safe — try sending the photo again in a moment.",
  proof_upload_not_allowed:
    "This job is past the stage where evidence can be added. Refresh the job to see where it is now.",
  forbidden: "This job is not assigned to your shop, so evidence cannot be added to it.",
};

export type UploadResult =
  | { ok: true; attachmentId: string }
  | { ok: false; error: string };

/**
 * Send one photo as self-QC evidence.
 *
 * The file is streamed from its device URI by the native uploader, so a large
 * photo is never read into JavaScript memory — that is what crashes mid-range
 * Android phones. The MIME type is passed through as reported (iOS is often
 * wrong about it) and the server decides whether it is acceptable.
 *
 * `onProgress` reports bytes sent. When it reaches 1 the transfer is done but
 * the server has not answered yet: callers show a distinct "still saving"
 * state until this promise resolves, because the file is not stored until
 * GRIDGO returns its id.
 */
export async function uploadEvidence(
  item: EvidenceItem,
  orderId: string,
  onProgress: (fraction: number) => void,
): Promise<UploadResult> {
  const token = api.getToken();
  if (!token) {
    return { ok: false, error: "Your session ended. Sign in again to add evidence." };
  }

  try {
    const task = createUploadTask(
      `${api.getApiBase()}/attachments`,
      item.uri,
      {
        httpMethod: "POST",
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: "file",
        mimeType: item.mimeType ?? undefined,
        parameters: { kind: "proof", orderId },
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      },
      (data) => {
        if (!data.totalBytesExpectedToSend) return;
        onProgress(
          Math.min(1, data.totalBytesSent / data.totalBytesExpectedToSend),
        );
      },
    );

    const response = await task.uploadAsync();
    if (!response) {
      return { ok: false, error: "The upload stopped before it finished. Try sending it again." };
    }

    const body = parseJson(response.body);
    if (response.status >= 200 && response.status < 300) {
      const attachmentId = readAttachmentId(body);
      // No id means nothing was stored, whatever the status code said.
      if (!attachmentId) {
        return {
          ok: false,
          error: "GRIDGO accepted the photo but did not confirm it was saved. Send it again.",
        };
      }
      return { ok: true, attachmentId };
    }

    const code = typeof body?.error === "string" ? body.error : "";
    return {
      ok: false,
      error:
        UPLOAD_MESSAGES[code] ??
        "GRIDGO could not save this photo. Check your connection and try again.",
    };
  } catch {
    return {
      ok: false,
      error: "The photo could not be sent. Check this device's connection and try again.",
    };
  }
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

function readAttachmentId(body: Record<string, unknown> | null): string | null {
  const attachment = body?.attachment;
  if (typeof attachment === "object" && attachment && "id" in attachment) {
    const id = (attachment as { id: unknown }).id;
    if (typeof id === "string" && id) return id;
  }
  return null;
}
