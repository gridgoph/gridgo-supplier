jest.mock("expo-file-system/legacy", () => ({
  createUploadTask: jest.fn(),
  FileSystemUploadType: { MULTIPART: 1 },
}));

import * as FileSystem from "expo-file-system/legacy";

import * as api from "@/lib/api";
import {
  isProofImage,
  isUploadBusy,
  messageFor,
  newUploadItem,
  storedUploads,
  tooLargeMessage,
  uploadStageLabel,
  uploadFile,
  type UploadItem,
} from "@/lib/files";

function item(partial: Partial<UploadItem> = {}): UploadItem {
  return {
    ...newUploadItem({
      key: "up_1",
      uri: "file:///proof.pdf",
      fileName: "proof.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
    }),
    ...partial,
  };
}

describe("newUploadItem", () => {
  it("starts with nothing claimed as stored", () => {
    const fresh = item();
    expect(fresh.stage).toBe("idle");
    expect(fresh.fileId).toBeNull();
    expect(fresh.progress).toBe(0);
  });
});

describe("storedUploads", () => {
  it("counts only files GRIDGO has returned an id for", () => {
    const list = [
      item({ key: "a", stage: "stored", fileId: "file_1" }),
      item({ key: "b", stage: "attached", fileId: "file_2" }),
      // Bytes are away but the API has not confirmed storage — not stored.
      item({ key: "c", stage: "processing", progress: 1 }),
      item({ key: "d", stage: "failed", error: "nope" }),
      // A stage without an id must never count, whatever set it.
      item({ key: "e", stage: "stored", fileId: null }),
    ];
    expect(storedUploads(list).map((i) => i.key)).toEqual(["a", "b"]);
  });
});

describe("isUploadBusy", () => {
  it("stays busy while bytes move and while the server finishes", () => {
    expect(isUploadBusy([item({ stage: "uploading" })])).toBe(true);
    expect(isUploadBusy([item({ stage: "processing" })])).toBe(true);
  });

  it("is idle once everything has settled either way", () => {
    expect(
      isUploadBusy([
        item({ key: "a", stage: "stored", fileId: "file_1" }),
        item({ key: "b", stage: "failed", error: "nope" }),
      ]),
    ).toBe(false);
  });
});

describe("isProofImage", () => {
  it("treats JPEG, PNG and WebP as photographs", () => {
    expect(isProofImage(item({ mimeType: "image/jpeg", fileName: "run.jpg" }))).toBe(true);
    expect(isProofImage(item({ mimeType: "image/png", fileName: "run.png" }))).toBe(true);
    expect(isProofImage(item({ mimeType: "image/webp", fileName: "run.webp" }))).toBe(true);
  });

  it("does not treat a PDF as a photograph", () => {
    expect(isProofImage(item({ mimeType: "application/pdf", fileName: "spec.pdf" }))).toBe(false);
  });

  it("falls back to the filename when the phone reported no type", () => {
    expect(isProofImage(item({ mimeType: null, fileName: "evidence-1.jpg" }))).toBe(true);
    expect(isProofImage(item({ mimeType: null, fileName: "spec.pdf" }))).toBe(false);
  });
});

describe("uploadStageLabel", () => {
  it("separates sending from still being saved", () => {
    expect(uploadStageLabel(item({ stage: "uploading", progress: 0.42 }))).toBe("Sending 42%");
    expect(uploadStageLabel(item({ stage: "processing", progress: 1 }))).toContain(
      "still saving",
    );
  });

  /**
   * Storing the bytes and filing them against a payout milestone are two
   * different things, and only the second one is what GRIDGO pays on. The
   * labels have to keep them apart or a shop reads "saved" as "claimed".
   */
  it("distinguishes saved to GRIDGO from filed against a milestone", () => {
    expect(uploadStageLabel(item({ stage: "stored", fileId: "file_1" }))).toContain(
      "Ready to file",
    );
    expect(uploadStageLabel(item({ stage: "attached", fileId: "file_1" }))).toBe(
      "Filed with GRIDGO",
    );
  });

  it("shows the specific failure rather than a generic one", () => {
    expect(uploadStageLabel(item({ stage: "failed", error: "That file is empty." }))).toBe(
      "That file is empty.",
    );
  });
});

describe("messageFor", () => {
  it("turns documented codes into a fix, never the code itself", () => {
    const heic = messageFor({ error: "heic_not_supported" }, 415);
    expect(heic).toContain("JPEG");
    expect(heic).not.toContain("heic_not_supported");

    const wrongMilestone = messageFor({ error: "invalid_milestone_code" }, 400);
    expect(wrongMilestone).toContain("part of the job");
    expect(wrongMilestone).not.toContain("invalid_milestone_code");

    expect(messageFor({ error: "milestone_not_found" }, 409)).toContain("refresh");
    expect(messageFor({ error: "minio_unavailable" }, 503)).toContain("try sending");
  });

  it("falls back without leaking a status code or a raw body", () => {
    const unknown = messageFor({ error: "some_new_code" }, 400);
    expect(unknown).not.toContain("some_new_code");
    expect(unknown).not.toContain("400");
  });

  it("names the session as the fix for an expired token", () => {
    expect(messageFor(null, 401)).toContain("Sign in");
  });
});

describe("tooLargeMessage", () => {
  it("says the size and the limit", () => {
    const message = tooLargeMessage(250 * 1024 * 1024);
    expect(message).toContain("250.0 MB");
    expect(message).toContain("200 MB");
  });
});

describe("upload authentication", () => {
  afterEach(() => {
    api.setToken(null);
    api.setTokenProvider(null);
    jest.clearAllMocks();
  });

  it("streams with a fresh Clerk token instead of a stale legacy bearer", async () => {
    api.setToken("legacy-token");
    api.setTokenProvider(async () => "fresh-clerk-token");
    jest.mocked(FileSystem.createUploadTask).mockReturnValue({
      uploadAsync: jest.fn(async () => ({
        status: 201,
        body: JSON.stringify({ file: { fileId: "file_1" } }),
      })),
    } as never);

    await expect(uploadFile(item(), "fulfilment_proof", jest.fn())).resolves.toEqual({
      ok: true,
      fileId: "file_1",
    });

    expect(FileSystem.createUploadTask).toHaveBeenCalledWith(
      expect.stringContaining("/files"),
      "file:///proof.pdf",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer fresh-clerk-token" }),
      }),
      expect.any(Function),
    );
  });
});
