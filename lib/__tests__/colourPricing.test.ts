import {
  colourLines,
  correctableColourLines,
  correctionBaseline,
  correctionDraft,
  correctionProblem,
  correctionStart,
  lowestSheetRate,
  pageLine,
  paperReading,
  readColourDraft,
  readColourPricing,
  readColourQuote,
  readCorrection,
  readPaperSize,
  sheetPriceMinor,
  sheetsLine,
  suggestedPapers,
  tierFor,
  tierLabel,
  unpricedSizes,
  type ColourDraft,
} from "@/lib/colourPricing";
import type { Order } from "@/lib/api";

describe("tiers", () => {
  it("draws every boundary inclusive at the top, as GRIDGO does", () => {
    expect(tierFor(0, "large_format")).toBe("none");
    expect(tierFor(1, "large_format")).toBe("up_to_25");
    expect(tierFor(2500, "large_format")).toBe("up_to_25");
    expect(tierFor(2501, "large_format")).toBe("up_to_50");
    expect(tierFor(5000, "large_format")).toBe("up_to_50");
    expect(tierFor(5001, "large_format")).toBe("above_50");
    expect(tierFor(1000, "a3")).toBe("monochrome");
    expect(tierFor(1001, "a3")).toBe("full_colour");
    expect(tierFor(1500, "a3", 2000)).toBe("monochrome");
  });

  it("says the A3 limit in force", () => {
    expect(tierLabel("monochrome")).toBe("Up to 10%, monochrome");
    expect(tierLabel("full_colour", 1250)).toBe("Above 12.5%, full colour");
    expect(tierLabel("none")).toBe("No strong colour");
  });
});

describe("paper sizes", () => {
  it("reads names and bare sizes in inches", () => {
    expect(readPaperSize("A3")).toEqual({ widthMilli: 297_000, heightMilli: 420_000, a3: true });
    expect(readPaperSize("20x30")).toEqual({ widthMilli: 508_000, heightMilli: 762_000, a3: false });
    expect(readPaperSize("420 x 297 mm")?.a3).toBe(true);
    expect(readPaperSize("banana")).toBeNull();
    expect(paperReading("A2")).toBe("420 × 594 mm. Priced in the four large-format tiers.");
    expect(paperReading("A3")).toBe("297 × 420 mm. Priced in the two A3 tiers.");
  });
});

describe("the shop's tier table", () => {
  const draft: ColourDraft = [
    { key: "a", paperSize: "20x30", prices: { none: "30", up_to_25: "60.00", up_to_50: "", above_50: "200" } },
    { key: "b", paperSize: "A3", prices: { monochrome: "0", full_colour: "" } },
  ];

  it("sends offered tiers in centavos, leaves blanks out, and keeps an explicit ₱0", () => {
    expect(readColourDraft(draft)).toEqual({
      ok: true,
      pricing: {
        sizes: [
          { paperSize: "20x30", tierSet: "large_format", prices: { none: 3000, up_to_25: 6000, above_50: 20000 } },
          { paperSize: "A3", tierSet: "a3", prices: { monochrome: 0 } },
        ],
      },
    });
  });

  it("names the first thing GRIDGO would refuse", () => {
    expect(readColourDraft([])).toMatchObject({ ok: false, problem: { key: null } });
    expect(readColourDraft([{ key: "x", paperSize: "banana", prices: {} }])).toMatchObject({
      ok: false,
      problem: { key: "x", message: expect.stringContaining("not a paper size") },
    });
    expect(
      readColourDraft([
        { key: "a", paperSize: "20x30", prices: {} },
        { key: "b", paperSize: "30x20", prices: {} },
      ]),
    ).toMatchObject({ ok: false, problem: { key: "b", message: "30x20 is the same paper as 20x30. Price each paper once." } });
    expect(readColourDraft([{ key: "a", paperSize: "A2", prices: { none: "12.345" } }])).toMatchObject({
      ok: false,
      problem: { key: "a", message: expect.stringContaining("“No strong colour” price") },
    });
  });

  it("never fills a price: a size with every tier blank needs a price check", () => {
    expect(unpricedSizes([{ key: "a", paperSize: "A1", prices: { none: " " } }])).toEqual(["A1"]);
    expect(unpricedSizes(draft)).toEqual([]);
  });

  it("offers the listing's own size choices once each", () => {
    expect(suggestedPapers(["20x30 / A2", "A3", "30x20", "Glossy"], draft)).toEqual([]);
    expect(suggestedPapers(["A1", "24x36", "A1"], draft)).toEqual(["A1", "24x36"]);
  });

  it("reads GRIDGO's table and its lowest offered rate", () => {
    const table = readColourPricing({
      sizes: [{ paperSize: "A3", tierSet: "a3", prices: { monochrome: 1000, full_colour: null, none: 5 } }],
    });
    expect(table).toEqual({ sizes: [{ paperSize: "A3", tierSet: "a3", prices: { monochrome: 1000 } }] });
    expect(lowestSheetRate(table)).toBe(1000);
    expect(lowestSheetRate({ sizes: [{ paperSize: "A3", tierSet: "a3", prices: {} }] })).toBeNull();
    expect(sheetPriceMinor("0")).toBe(0);
    expect(sheetPriceMinor("1.5.0")).toBeNull();
  });
});

const evidence = {
  version: 1,
  status: "priced",
  pricedByColour: true,
  estimate: true,
  quantityMode: "document_sets",
  quantity: 3,
  totalSheets: 6,
  paperSize: "20x30",
  tierSet: "large_format",
  lineSubtotalMinor: 27000,
  warning: null,
  request: { thresholds: { a3MonochromeMaxBps: 1000 } },
  pages: [
    { fileId: "file_pdf", page: 1, strongColourBps: 0, tier: "none", sheetPriceMinor: 3000, status: "priced" },
    { fileId: "file_pdf", page: 2, strongColourBps: 1800, tier: "up_to_25", sheetPriceMinor: 6000, status: "priced" },
  ],
};

describe("the reading on a job", () => {
  it("says each page the way the report does", () => {
    const quote = readColourQuote(evidence)!;
    expect(pageLine(quote.pages[1])).toBe("Page 2: 18% strong colour, ₱60.00");
    expect(pageLine({ page: 3, strongColourBps: 4200, sheetPriceMinor: null })).toBe(
      "Page 3: 42% strong colour. This page needs a price check",
    );
    expect(sheetsLine("document_sets", 3, 12)).toBe("3 sets × 12 pages = 36 sheets");
    expect(sheetsLine("copies_each_page", 2, 1)).toBe("2 copies of each page × 1 page = 2 sheets");
  });

  it("finds colour lines and keeps one-colour readings out of corrections", () => {
    const order = {
      productionItems: [
        { id: "line_1", colourPricing: evidence },
        { id: "line_2", colourPricing: { ...evidence, pricedByColour: false, status: "fixed_price" } },
        { id: "line_3" },
      ],
    } as unknown as Pick<Order, "productionItems">;
    expect(colourLines(order).map((line) => line.item.id)).toEqual(["line_1", "line_2"]);
    expect(correctableColourLines(order).map((line) => line.item.id)).toEqual(["line_1"]);
  });
});

describe("a colour correction", () => {
  const quote = readColourQuote(evidence)!;

  it("works out the corrected total on the original quantity, against the original line", () => {
    const rows = correctionDraft(quote);
    rows[0] = { ...rows[0], percent: "18", price: "60" };
    const read = readCorrection(quote, rows, correctionBaseline(quote, null)!);
    expect(read).toEqual({
      ok: true,
      pages: [
        { fileId: "file_pdf", page: 1, strongColourBps: 1800, sheetPriceMinor: 6000 },
        { fileId: "file_pdf", page: 2, strongColourBps: 1800, sheetPriceMinor: 6000 },
      ],
      correctedLineSubtotalMinor: 36000,
      extraMinor: 9000,
      changed: true,
    });
    expect(correctionProblem(read, 27000)).toBeNull();
  });

  it("measures a second correction against the one the client agreed to, page for page", () => {
    expect(correctionBaseline(quote, { correctedLineSubtotalMinor: 36000 })).toBe(36000);
    const agreedPages = [{ ...quote.pages[0], strongColourBps: 1800, tier: "up_to_25" as const, sheetPriceMinor: 6000 }];
    const start = correctionStart(quote, { pages: agreedPages });
    expect(start.pages.map((page) => [page.page, page.strongColourBps, page.sheetPriceMinor])).toEqual([
      [1, 1800, 6000],
      [2, 1800, 6000],
    ]);
    const unchanged = readCorrection(start, correctionDraft(start), 36000);
    expect(unchanged).toMatchObject({ ok: true, changed: false, extraMinor: 0 });
    expect(correctionStart(quote, null)).toBe(quote);
  });

  it("refuses an unchanged correction and turns a lower one into a refund", () => {
    const same = readCorrection(quote, correctionDraft(quote), 27000);
    expect(correctionProblem(same, 27000)).toBe("Change the reading or price of at least one page.");
    const rows = correctionDraft(quote);
    rows[1] = { ...rows[1], percent: "0", price: "30" };
    expect(correctionProblem(readCorrection(quote, rows, 27000), 27000)).toContain("A lower price is a refund");
    rows[1] = { ...rows[1], percent: "120" };
    expect(correctionProblem(readCorrection(quote, rows, 27000), 27000)).toBe(
      "Page 2: enter the strong colour as a percent from 0 to 100.",
    );
  });
});
