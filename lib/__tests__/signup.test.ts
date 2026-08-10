import {
  categoryRanks,
  promoteCategory,
  toggleCategory,
  toSignupRequest,
} from "@/lib/signup";
import { EMPTY_SIGNUP_DRAFT, type SignupDraft } from "@/store/signupDraft";

function draft(partial: Partial<SignupDraft> = {}): SignupDraft {
  return {
    ...EMPTY_SIGNUP_DRAFT,
    shopName: "PrintRight Davao",
    contactName: "Ben Santos",
    email: "ben@printright.ph",
    phone: "0917 123 4567",
    password: "at-least-8",
    pin: { lat: 7.0644, lng: 125.6085, label: "C.M. Recto St, Poblacion, Davao City" },
    categoryCodes: ["marketing_collateral"],
    ...partial,
  };
}

/**
 * The captain's model is that a shop declares what it does **best first**, and
 * the platform requires ranks to run 1..n with no gaps or duplicates. Position
 * in the list is the only place that order is recorded, so it has to produce
 * exactly that shape from any sequence of taps.
 */
describe("ranking", () => {
  it("turns list position into rank, best first", () => {
    expect(categoryRanks(["marketing_collateral", "corporate_event_merch"])).toEqual([
      { categoryCode: "marketing_collateral", rank: 1 },
      { categoryCode: "corporate_event_merch", rank: 2 },
    ]);
  });

  it("renumbers with no gaps when one is removed", () => {
    const after = toggleCategory(["a", "b", "c"], "b");
    expect(after).toEqual(["a", "c"]);
    expect(categoryRanks(after).map((r) => r.rank)).toEqual([1, 2]);
  });

  it("adds a new choice at the bottom rather than displacing the best", () => {
    expect(toggleCategory(["a"], "b")).toEqual(["a", "b"]);
  });

  it("promotes one place at a time and stops at the top", () => {
    expect(promoteCategory(["a", "b", "c"], "c")).toEqual(["a", "c", "b"]);
    expect(promoteCategory(["a", "b"], "a")).toEqual(["a", "b"]);
    expect(promoteCategory(["a", "b"], "missing")).toEqual(["a", "b"]);
  });

  it("keeps ranks unique however the list was built", () => {
    let codes: string[] = [];
    for (const code of ["a", "b", "c"]) codes = toggleCategory(codes, code);
    codes = promoteCategory(codes, "c");
    codes = toggleCategory(codes, "a");
    const ranks = categoryRanks(codes);
    expect(ranks.map((r) => r.rank)).toEqual([1, 2]);
    expect(new Set(ranks.map((r) => r.categoryCode)).size).toBe(ranks.length);
  });
});

describe("toSignupRequest", () => {
  it("sends the pin the shop placed on the map, with its own label", () => {
    const request = toSignupRequest(draft());
    expect(request?.shop).toEqual({
      lat: 7.0644,
      lng: 125.6085,
      label: "C.M. Recto St, Poblacion, Davao City",
    });
  });

  it("trims what a phone keyboard leaves behind", () => {
    const request = toSignupRequest(draft({ email: "  ben@shop.ph  ", shopName: " Shop " }));
    expect(request?.email).toBe("ben@shop.ph");
    expect(request?.supplierName).toBe("Shop");
  });

  /**
   * A missing pin would otherwise price every delivery from the origin of the
   * map, which is in the Gulf of Guinea.
   */
  it("refuses to build a request without a placed pin", () => {
    expect(toSignupRequest(draft({ pin: null }))).toBeNull();
    expect(toSignupRequest(draft({ pin: { lat: 0, lng: 0, label: "Nowhere" } }))).toBeNull();
  });

  it("refuses a pin with no address on it", () => {
    expect(
      toSignupRequest(draft({ pin: { lat: 7.06, lng: 125.6, label: "   " } })),
    ).toBeNull();
  });
});
