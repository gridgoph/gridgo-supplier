import {
  isUploadBusy,
  messageFor,
  newUploadItem,
  storedUploads,
  tooLargeMessage,
  uploadStageLabel,
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

describe("uploadStageLabel", () => {
  it("separates sending from still being saved", () => {
    expect(uploadStageLabel(item({ stage: "uploading", progress: 0.42 }))).toBe("Sending 42%");
    expect(uploadStageLabel(item({ stage: "processing", progress: 1 }))).toContain(
      "still saving",
    );
  });

  it("distinguishes saved to GRIDGO from sent to the client", () => {
    expect(uploadStageLabel(item({ stage: "stored", fileId: "file_1" }))).toContain(
      "Ready to send",
    );
    expect(uploadStageLabel(item({ stage: "attached", fileId: "file_1" }))).toBe(
      "Sent to the client",
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

    expect(messageFor({ error: "proof_upload_not_allowed" }, 409)).toContain("refresh");
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
