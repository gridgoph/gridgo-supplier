import type { ProductionItem } from "@/lib/api";
import { attachmentCountLine, attachmentGroups, itemAttachments, showsAttachmentList } from "@/lib/artworkAttachments";
import { orderDesignLinks } from "@/lib/designLink";
import { orderArtwork } from "@/lib/orderArtwork";

const CANVA = "https://www.canva.com/design/DAG1/view";

function item(partial: Partial<ProductionItem> = {}): ProductionItem {
  return { id: "l1", itemName: "T-shirt", quantity: 10, pricingUnit: null, packageQty: null, measurement: null, structuredSpec: {}, options: [], artworkFileId: null, mockupFileId: null, ...partial };
}

const several = item({
  artworkFileId: "front",
  artworkLinks: [{ formatCode: "canva_link", url: CANVA, label: "Logo design" }],
  artworkAttachments: [
    { kind: "link", formatCode: "canva_link", url: CANVA, label: "Logo design" },
    { kind: "file", fileId: "front", label: " Front ", downloadUrl: "https://files.test/front", downloadUrlExpiresAt: "2026-10-15T00:05:00.000Z" },
    { kind: "file", fileId: "back", label: "Back" },
    { kind: "file", fileId: "logo" },
  ],
});

describe("artwork attachments", () => {
  it("keeps the client's order and labels, and marks the first file as the main file", () => {
    const entries = itemAttachments(several);
    expect(entries.map((entry) => (entry.kind === "file" ? entry.fileId : entry.link.url))).toEqual([CANVA, "front", "back", "logo"]);
    expect(entries.map((entry) => entry.label)).toEqual(["Logo design", "Front", "Back", null]);
    expect(entries.filter((entry) => entry.kind === "file" && entry.main).map((entry) => entry.kind === "file" && entry.fileId)).toEqual(["front"]);
    expect(entries[1]).toMatchObject({ downloadUrl: "https://files.test/front", downloadUrlExpiresAt: "2026-10-15T00:05:00.000Z" });
  });

  it("reads an older line as its one file, then its links", () => {
    const entries = itemAttachments(item({ artworkFileId: "flyer", artworkLinks: [{ formatCode: "google_drive", url: "https://drive.google.com/file/d/A/view" }] }));
    expect(entries).toEqual([
      { kind: "file", fileId: "flyer", label: null, main: true },
      { kind: "link", label: null, link: expect.objectContaining({ provider: "google_drive", url: "https://drive.google.com/file/d/A/view" }) },
    ]);
  });

  it("drops what a shop must not open: non-HTTPS links, malformed and repeated entries", () => {
    const entries = itemAttachments(item({ artworkAttachments: [
      { kind: "file", fileId: "a" }, { kind: "file", fileId: "a" }, { kind: "file", fileId: "" },
      { kind: "link", formatCode: "other_link", url: "javascript:alert(1)" },
      { kind: "link", formatCode: "other_link", url: "http://example.com/art" },
      null as never, { kind: "mystery" } as never,
    ] }));
    expect(entries).toEqual([{ kind: "file", fileId: "a", label: null, main: true }]);
  });

  it("uses the list only for several entries or a label, so a one-file job keeps its card", () => {
    expect(showsAttachmentList({ productionItems: [item({ artworkFileId: "a" })] })).toBe(false);
    expect(showsAttachmentList({ productionItems: [item({ artworkAttachments: [{ kind: "file", fileId: "a" }] })] })).toBe(false);
    expect(showsAttachmentList({ productionItems: [item({ artworkAttachments: [{ kind: "file", fileId: "a", label: "Front" }] })] })).toBe(true);
    expect(showsAttachmentList({ productionItems: [several] })).toBe(true);
    expect(showsAttachmentList({ productionItems: [item({ artworkFileId: "a", artworkLinks: [{ formatCode: "canva_link", url: CANVA }] })] })).toBe(true);
  });

  it("groups by item and counts files and links apart", () => {
    const groups = attachmentGroups({ productionItems: [several, item({ id: "l2", itemName: "Tote" }), item({ id: "l3", itemName: "Cap", artworkFileId: "cap" })] });
    expect(groups.map((group) => group.itemName)).toEqual(["T-shirt", "Cap"]);
    expect(attachmentCountLine(groups[0].entries)).toBe("3 files · 1 design link");
    expect(attachmentCountLine(groups[1].entries)).toBe("1 file");
  });

  it("counts every attached file and carries link labels to the rest of the job screen", () => {
    expect(orderArtwork({ productionItems: [several] }).map((file) => file.fileId)).toEqual(["front", "back", "logo"]);
    expect(orderDesignLinks({ productionItems: [several] })).toEqual([
      expect.objectContaining({ url: CANVA, label: "Logo design", provider: "canva", itemName: "T-shirt" }),
    ]);
  });
});
