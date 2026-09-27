import type { ProductionItem } from "@/lib/api";
import { linkDisplay, linkOnlySummary, linkProvider, orderDesignLinks } from "@/lib/designLink";

function item(partial: Partial<ProductionItem> = {}): ProductionItem {
  return { id: "l1", itemName: "Flyers", quantity: 500, pricingUnit: null, packageQty: null, measurement: null, structuredSpec: {}, options: [], artworkFileId: null, mockupFileId: null, ...partial };
}

describe("design links", () => {
  it("names the provider from the format code, and from the address for other links", () => {
    expect(linkProvider({ formatCode: "canva_link", url: "https://www.canva.com/design/ABC/view" })).toBe("canva");
    expect(linkProvider({ formatCode: "we_transfer", url: "https://we.tl/t-abc" })).toBe("we_transfer");
    expect(linkProvider({ formatCode: "other_link", url: "https://drive.google.com/file/d/ABC/view" })).toBe("google_drive");
    expect(linkProvider({ formatCode: "other_link", url: "https://www.dropbox.com/s/abc/art.pdf?dl=0" })).toBe("dropbox");
    expect(linkProvider({ formatCode: "other_link", url: "https://canva.com.evil.example/design" })).toBe("other");
    expect(linkProvider({ formatCode: "future_code", url: "https://example.com/art" })).toBe("other");
  });

  it("shows host and path without scheme, www or query", () => {
    expect(linkDisplay("https://www.canva.com/design/ABC/TOKEN/view?utm_content=x")).toBe("canva.com/design/ABC/TOKEN/view");
    expect(linkDisplay("https://example.com/")).toBe("example.com");
  });

  it("collects every line's links once, keeping the line name, and only HTTPS", () => {
    const links = orderDesignLinks({
      productionItems: [
        item({ artworkLinks: [{ formatCode: "canva_link", url: "https://www.canva.com/design/A/view" }, { formatCode: "other_link", url: "http://example.com/art" }] }),
        item({ id: "l2", itemName: "Banner", artworkLinks: [{ formatCode: "canva_link", url: "https://www.canva.com/design/A/view" }, { formatCode: "google_drive", url: "https://drive.google.com/file/d/B/view" }] }),
      ],
    });
    expect(links).toEqual([
      { formatCode: "canva_link", url: "https://www.canva.com/design/A/view", provider: "canva", itemName: "Flyers" },
      { formatCode: "google_drive", url: "https://drive.google.com/file/d/B/view", provider: "google_drive", itemName: "Banner" },
    ]);
  });

  it("reads an API older than the links as having none", () => {
    expect(orderDesignLinks({ productionItems: [item()] })).toEqual([]);
    expect(orderDesignLinks({})).toEqual([]);
  });

  it("says plainly that a link is the only artwork", () => {
    const canva = { formatCode: "canva_link", url: "https://www.canva.com/design/A/view", provider: "canva" as const };
    const drive = { formatCode: "google_drive", url: "https://drive.google.com/file/d/B/view", provider: "google_drive" as const };
    expect(linkOnlySummary([canva])).toBe("Canva link only, no file uploaded");
    expect(linkOnlySummary([canva, { ...canva, url: "https://www.canva.com/design/C/view" }])).toBe("2 Canva links only, no file uploaded");
    expect(linkOnlySummary([canva, drive])).toBe("2 design links only, no file uploaded");
  });
});
