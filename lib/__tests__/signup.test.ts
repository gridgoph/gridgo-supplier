import {
  categoryRanks,
  EMPTY_SIGNUP_FORM,
  hasErrors,
  promoteCategory,
  toggleCategory,
  toSignupRequest,
  validateSignup,
  type SignupForm,
} from "@/lib/signup";
import { DAVAO_AREAS } from "@/data/davaoAreas";

function form(partial: Partial<SignupForm> = {}): SignupForm {
  return {
    shopName: "PrintRight Davao",
    contactName: "Ben Santos",
    email: "ben@printright.ph",
    phone: "0917 123 4567",
    password: "at-least-8",
    areaCode: DAVAO_AREAS[0].code,
    streetAddress: "C.M. Recto St",
    categoryCodes: ["marketing_collateral"],
    ...partial,
  };
}

describe("validateSignup", () => {
  it("accepts a complete form", () => {
    expect(validateSignup(form())).toEqual({});
    expect(hasErrors(validateSignup(form()))).toBe(false);
  });

  it("names every missing field on an empty form", () => {
    const errors = validateSignup(EMPTY_SIGNUP_FORM);
    expect(Object.keys(errors).sort()).toEqual(
      [
        "areaCode",
        "categoryCodes",
        "contactName",
        "email",
        "password",
        "phone",
        "shopName",
        "streetAddress",
      ].sort(),
    );
  });

  it("rejects a password the platform would reject anyway, before sending it", () => {
    expect(validateSignup(form({ password: "short" })).password).toContain("8");
    expect(validateSignup(form({ password: "12345678" })).password).toBeUndefined();
  });

  it("catches an email typo without inventing a rule the platform does not have", () => {
    expect(validateSignup(form({ email: "ben" })).email).toBeTruthy();
    expect(validateSignup(form({ email: "ben@shop" })).email).toBeTruthy();
    expect(validateSignup(form({ email: "ben+jobs@shop.com.ph" })).email).toBeUndefined();
  });

  it("accepts a phone number however it is punctuated", () => {
    for (const phone of ["09171234567", "0917 123 4567", "+63 917 123 4567"]) {
      expect(validateSignup(form({ phone })).phone).toBeUndefined();
    }
    expect(validateSignup(form({ phone: "12345" })).phone).toBeTruthy();
  });

  it("requires at least one kind of work, because a rank of nothing is nothing", () => {
    expect(validateSignup(form({ categoryCodes: [] })).categoryCodes).toBeTruthy();
  });

  it("never puts an error message in the platform's own words", () => {
    for (const message of Object.values(validateSignup(EMPTY_SIGNUP_FORM))) {
      expect(message).not.toMatch(/_/);
    }
  });
});

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
  it("sends the shop's pin from the area it picked, with the street in the label", () => {
    const request = toSignupRequest(form());
    expect(request?.shop.lat).toBe(DAVAO_AREAS[0].lat);
    expect(request?.shop.lng).toBe(DAVAO_AREAS[0].lng);
    expect(request?.shop.label).toContain("C.M. Recto St");
    expect(request?.shop.label).toContain("Davao City");
  });

  it("trims what a phone keyboard leaves behind", () => {
    const request = toSignupRequest(form({ email: "  ben@shop.ph  ", shopName: " Shop " }));
    expect(request?.email).toBe("ben@shop.ph");
    expect(request?.supplierName).toBe("Shop");
  });

  /** An unknown area would otherwise pin the shop at the origin of the map. */
  it("refuses to build a request from an area it does not know", () => {
    expect(toSignupRequest(form({ areaCode: "atlantis" }))).toBeNull();
    expect(toSignupRequest(form({ areaCode: null }))).toBeNull();
  });
});
