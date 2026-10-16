import { draftFrom, listingSavePatch, sameDraft } from "@/lib/listingDraft";
import { normalizeListing } from "@/lib/listings";
import {
  layoutDiagram,
  printLayoutFacts,
  printLayoutsNote,
  readPrintLayoutCheck,
  readPrintLayouts,
  togglePrintLayout,
} from "@/lib/printLayout";

/** GRIDGO's own answer for a two-page plan set (A1 cover, A0 drawing) on A1 paper, actual size, centred. */
const CUT_OFF_CHECK = {
  supportedLayouts: ["fit_to_paper", "actual_size_centered", "actual_size_original_position"],
  layout: "actual_size_centered",
  paper: { optionId: "opt_a1", label: "24x36 / A1", widthMilli: 594000, heightMilli: 841000, pageSize: "A1" },
  files: [{
    fileId: "file_plans",
    page: {
      widthMilli: 594078, heightMilli: 841022, pageSize: null, orientation: "portrait",
      largestShortSideMilli: 841022, largestLongSideMilli: 1188861, mixedPageSizes: true,
    },
    exceedsPaper: true,
  }],
  exceedsPaper: true,
  cutOff: true,
  scaleChanges: false,
  suggestedPaper: { optionId: "opt_a0", label: "A0", widthMilli: 841000, heightMilli: 1189000, pageSize: "A0" },
  unknown: [],
};

/** An A1 page fitted to A2 paper. */
const SHRINK_CHECK = {
  ...CUT_OFF_CHECK,
  layout: "fit_to_paper",
  paper: { optionId: "opt_a2", label: "20x30 / A2", widthMilli: 420000, heightMilli: 594000, pageSize: "A2" },
  files: [{
    fileId: "file_floor",
    page: {
      widthMilli: 594078, heightMilli: 841022, pageSize: null, orientation: "portrait",
      largestShortSideMilli: 594078, largestLongSideMilli: 841022, mixedPageSizes: false,
    },
    exceedsPaper: true,
  }],
  cutOff: false,
  scaleChanges: true,
  suggestedPaper: { optionId: "opt_a1", label: "24x36 / A1", widthMilli: 594000, heightMilli: 841000, pageSize: "A1" },
};

describe("a listing's print layouts", () => {
  it("keeps known codes only, once each, in GRIDGO's order", () => {
    expect(readPrintLayouts(["actual_size_original_position", "fit_to_paper", "fit_to_paper", "stretch"])).toEqual([
      "fit_to_paper",
      "actual_size_original_position",
    ]);
    expect(readPrintLayouts(undefined)).toEqual([]);
    expect(togglePrintLayout(["actual_size_centered"], "fit_to_paper")).toEqual(["fit_to_paper", "actual_size_centered"]);
    expect(togglePrintLayout(["fit_to_paper"], "fit_to_paper")).toEqual([]);
  });

  it("is read from GRIDGO's listing, and an older GRIDGO without it reads as none", () => {
    expect(normalizeListing({ item: { id: "sci_1", printLayouts: ["actual_size_centered"] } })?.printLayouts).toEqual([
      "actual_size_centered",
    ]);
    expect(normalizeListing({ item: { id: "sci_1" } })?.printLayouts).toEqual([]);
  });

  it("is part of the draft, so a change is unsaved work and goes out with the save", () => {
    const listing = normalizeListing({ item: { id: "sci_1", printLayouts: [] } });
    if (!listing) throw new Error("listing");
    const draft = draftFrom(listing);
    const marked = { ...draft, printLayouts: togglePrintLayout(draft.printLayouts, "fit_to_paper") };
    expect(sameDraft(draft, marked)).toBe(false);
    expect(listingSavePatch(marked, 0).printLayouts).toEqual(["fit_to_paper"]);
    expect(listingSavePatch(draft, 0).printLayouts).toEqual([]);
  });

  it("says that marking makes clients choose, and when the change waits on review", () => {
    expect(printLayoutsNote({ layouts: [], changed: false, hasApprovedVersion: true, pendingReview: false })).toEqual([
      "With none marked, clients are not asked about layout.",
    ]);
    expect(
      printLayoutsNote({ layouts: ["fit_to_paper"], changed: true, hasApprovedVersion: true, pendingReview: false }),
    ).toEqual([
      "Clients must choose this layout before they can order this listing.",
      "Saving sends this change to the GRIDGO Team for review. Until it is approved, clients keep the layouts they see now.",
    ]);
    expect(
      printLayoutsNote({ layouts: ["fit_to_paper", "actual_size_centered"], changed: false, hasApprovedVersion: true, pendingReview: true })[1],
    ).toBe(
      "Your latest changes to this listing are with the GRIDGO Team. Until they are approved, clients see the layouts from your approved version.",
    );
    // A listing nobody has approved yet goes to review whole.
    expect(
      printLayoutsNote({ layouts: ["fit_to_paper"], changed: true, hasApprovedVersion: false, pendingReview: true })[1],
    ).toBe("The GRIDGO Team reviews layouts with the rest of this listing.");
  });
});

describe("the agreed layout on a job", () => {
  it("shows nothing for a line without a layout", () => {
    expect(printLayoutFacts({ printLayout: null, printLayoutCheck: null })).toBeNull();
    expect(printLayoutFacts({})).toBeNull();
  });

  it("names the layout, the paper and the client's page, and says the cut-off was agreed", () => {
    const facts = printLayoutFacts({ printLayout: "actual_size_centered", printLayoutCheck: CUT_OFF_CHECK });
    expect(facts?.rows).toEqual([
      { label: "Print layout", value: "Actual size, centred" },
      { label: "Paper", value: "24x36 / A1" },
      { label: "Their page", value: "Mixed sizes, largest 841 × 1189 mm" },
    ]);
    expect(facts?.notes).toEqual([
      {
        tone: "cut_off",
        text: "Their page is bigger than 24x36 / A1, so at actual size its edges fall off the paper. The client was told before ordering and kept this layout, so print it as agreed.",
      },
      { tone: "cut_off", text: "A0 would have taken the whole page." },
    ]);
  });

  it("says a fit to paper shrinks the drawing and changes its scale", () => {
    const facts = printLayoutFacts({ printLayout: "fit_to_paper", printLayoutCheck: SHRINK_CHECK });
    expect(facts?.rows[2]).toEqual({ label: "Their page", value: "594 × 841 mm" });
    expect(facts?.notes).toEqual([
      {
        tone: "scaled",
        text: "Shrink the page to fit 20x30 / A2. The drawing scale changes; the client was told before ordering.",
      },
    ]);
  });

  it("says what GRIDGO could not read instead of guessing", () => {
    const facts = printLayoutFacts({
      printLayout: "actual_size_original_position",
      printLayoutCheck: {
        layout: "actual_size_original_position",
        paper: null,
        files: [{ fileId: "file_scan", page: null, exceedsPaper: null }],
        exceedsPaper: null,
        cutOff: null,
        scaleChanges: false,
        suggestedPaper: null,
        unknown: [{ code: "paper_size_unknown" }, { code: "page_size_unknown", fileId: "file_scan" }],
      },
    });
    expect(facts?.rows).toEqual([
      { label: "Print layout", value: "Actual size, in its original position" },
      { label: "Paper", value: "Not read", muted: true },
      { label: "Their page", value: "Not read", muted: true },
    ]);
    expect(facts?.notes.map((note) => note.tone)).toEqual(["unread", "unread"]);
    expect(facts?.notes[1].text).toBe("GRIDGO could not read the page size of the file. Check it before printing.");
  });

  it("keeps the layout when an older order carries no check", () => {
    expect(printLayoutFacts({ printLayout: "fit_to_paper" })).toEqual({
      layout: "fit_to_paper",
      rows: [{ label: "Print layout", value: "Fit to paper" }],
      notes: [],
    });
    expect(readPrintLayoutCheck("not a check")).toBeNull();
  });
});

describe("the layout picture", () => {
  const paper = { width: 210, height: 297 };
  const page = { width: 297, height: 420 };
  const box = { width: 100, height: 100 };

  it("fits the page inside the paper, keeping its actual size as an outline", () => {
    const shape = layoutDiagram("fit_to_paper", paper, page, box);
    expect(shape.page.width).toBeCloseTo(shape.paper.width, 1);
    expect(shape.page.height).toBeCloseTo(shape.paper.height, 1);
    expect(shape.original?.width).toBeGreaterThan(shape.paper.width);
  });

  it("centres an actual-size page so it overhangs every side alike", () => {
    const shape = layoutDiagram("actual_size_centered", paper, page, box);
    expect(shape.paper.x - shape.page.x).toBeCloseTo(shape.page.x + shape.page.width - (shape.paper.x + shape.paper.width));
    expect(shape.original).toBeNull();
  });

  it("pins an original-position page to the paper's top-left corner", () => {
    const shape = layoutDiagram("actual_size_original_position", paper, page, box);
    expect(shape.page.x).toBeCloseTo(shape.paper.x);
    expect(shape.page.y).toBeCloseTo(shape.paper.y);
  });

  it("turns the paper to the page's orientation", () => {
    const shape = layoutDiagram("actual_size_centered", paper, { width: 400, height: 280 }, box);
    expect(shape.paper.width).toBeGreaterThan(shape.paper.height);
  });
});
