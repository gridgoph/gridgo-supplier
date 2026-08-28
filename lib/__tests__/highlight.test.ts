import { huntSegments, huntTerms } from "@/lib/highlight";

/**
 * Why a tile is on the wall.
 *
 * GRIDGO ranks the hunt across the whole listing, so a sample can come back for
 * words that are nowhere in its name. Marking the run that did match is the
 * answer to "why this one", and getting the runs wrong is worse than not
 * marking at all: a name broken at the wrong letter reads as a typo.
 */
describe("marking the run a hunt matched", () => {
  it("leaves a name alone when there is no hunt", () => {
    expect(huntSegments("Tarpaulin, 13oz", "")).toEqual([
      { text: "Tarpaulin, 13oz", match: false },
    ]);
    expect(huntSegments("Tarpaulin, 13oz", "   ")).toEqual([
      { text: "Tarpaulin, 13oz", match: false },
    ]);
  });

  it("marks the run wherever it sits, whatever the case", () => {
    expect(huntSegments("Tarpaulin, 13oz", "tarp")).toEqual([
      { text: "Tarp", match: true },
      { text: "aulin, 13oz", match: false },
    ]);
    expect(huntSegments("Matte tarpaulin", "TARP")).toEqual([
      { text: "Matte ", match: false },
      { text: "tarp", match: true },
      { text: "aulin", match: false },
    ]);
  });

  it("marks every word the shop typed, in any order", () => {
    expect(huntSegments("Gold foil business cards", "cards gold")).toEqual([
      { text: "Gold", match: true },
      { text: " foil business ", match: false },
      { text: "cards", match: true },
    ]);
  });

  /** Overlapping words must not split a name mid-letter. */
  it("merges runs that overlap rather than nesting them", () => {
    expect(huntSegments("Tarpaulin", "tarp tarpaulin")).toEqual([
      { text: "Tarpaulin", match: true },
    ]);
    expect(huntTerms("tarp tarpaulin")).toEqual(["tarpaulin", "tarp"]);
  });

  it("keeps the digits and the x a shop types for a size", () => {
    expect(huntSegments("Tarpaulin 10x10 ft", "10x10")).toEqual([
      { text: "Tarpaulin ", match: false },
      { text: "10x10", match: true },
      { text: " ft", match: false },
    ]);
  });

  it("says nothing matched rather than inventing a run", () => {
    expect(huntSegments("Tarpaulin, 13oz", "linen")).toEqual([
      { text: "Tarpaulin, 13oz", match: false },
    ]);
    expect(huntSegments("", "tarp")).toEqual([{ text: "", match: false }]);
  });
});
