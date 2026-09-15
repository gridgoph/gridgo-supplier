import type { StoredFile } from "@/lib/api";
import { describeArtwork, isArtworkImage, isOrderArtwork, orderArtwork, readOrderArtwork } from "@/lib/orderArtwork";

const file = (overrides: Partial<StoredFile> = {}): StoredFile => ({
  fileId: "art1", purpose: "artwork", originalFilename: "Print.pdf", detectedContentType: "application/pdf", declaredContentType: "application/pdf", size: 1024,
  ownerId: "client1", state: "ready", createdAt: "today", readyAt: "today", references: [{ type: "order", id: "order1", field: "line:line1:artwork" }], ...overrides,
});

describe("production artwork", () => {
  it("deduplicates all line and legacy artwork while keeping mockups distinct", () => {
    expect(orderArtwork({ artworkFileIds: ["a", "b"], mockupFileIds: ["m"], productionItems: [{ id: "line1", itemName: "Banner", quantity: 1, pricingUnit: null, packageQty: null, measurement: null, structuredSpec: {}, options: [], artworkFileId: "a", mockupFileId: "m" }] })).toEqual([
      { fileId: "a", kind: "artwork", itemName: "Banner" }, { fileId: "m", kind: "mockup", itemName: "Banner" }, { fileId: "b", kind: "artwork" },
    ]);
  });
  it("does not mistake a display filename for an uploaded file", () => expect(orderArtwork({})).toEqual([]));
  it.each(["image/jpeg", "image/png", "image/webp"])("previews supported pixels: %s", (mime) => expect(isArtworkImage(file({ detectedContentType: mime }))).toBe(true));
  it.each(["application/pdf", "image/vnd.adobe.photoshop", "application/octet-stream"])("does not render a document as an image: %s", (mime) => expect(isArtworkImage(file({ detectedContentType: mime }))).toBe(false));
  it("accepts current line references and legacy order artwork", () => {
    expect(isOrderArtwork(file(), "order1", "artwork")).toBe(true);
    expect(isOrderArtwork(file({ references: [{ type: "order", id: "order1", field: "artworkFileIds" }] }), "order1", "artwork")).toBe(true);
    expect(isOrderArtwork(file({ purpose: "mockup", references: [{ type: "order", id: "order1", field: "line:line1:mockup" }] }), "order1", "mockup")).toBe(true);
  });
  it("refuses unrelated evidence, another order and unfinished files", () => {
    expect(isOrderArtwork(file({ purpose: "verification_document" }), "order1", "artwork")).toBe(false);
    expect(isOrderArtwork(file(), "order2", "artwork")).toBe(false);
    expect(isOrderArtwork(file({ state: "deleted" }), "order1", "artwork")).toBe(false);
  });
  it("keeps PDF metadata usable without requesting an image URL", async () => {
    const reader = { getFile: jest.fn(async () => file()), getDownloadUrl: jest.fn(async () => ({ url: "signed" })) };
    await expect(readOrderArtwork({ fileId: "art1", kind: "artwork" }, "order1", reader)).resolves.toMatchObject({ previewUrl: null });
    expect(reader.getDownloadUrl).not.toHaveBeenCalled();
  });
  it("gets a fresh image URL and fails closed before downloading unrelated evidence", async () => {
    const reader = { getFile: jest.fn(async () => file({ detectedContentType: "image/png" })), getDownloadUrl: jest.fn(async () => ({ url: "fresh-signed" })) };
    await expect(readOrderArtwork({ fileId: "art1", kind: "artwork" }, "order1", reader)).resolves.toMatchObject({ previewUrl: "fresh-signed" });
    reader.getDownloadUrl.mockClear();
    reader.getFile.mockResolvedValue(file({ purpose: "verification_document" }));
    await expect(readOrderArtwork({ fileId: "art1", kind: "artwork" }, "order1", reader)).rejects.toThrow();
    expect(reader.getDownloadUrl).not.toHaveBeenCalled();
  });
  it("names PDFs rather than calling every attachment a photo", () => expect(describeArtwork(file())).toBe("PDF · 1 KB"));
});
