import { ApiError, type SupplierProfile } from "@/lib/api";
import * as api from "@/lib/api";
import {
  draftFromProfile,
  hasShopDetailChanges,
  loadShopDetails,
  saveShopDetails,
  shopDetailPatch,
  shopDetailProblems,
  SHOP_DETAILS_NOT_OPEN_YET,
  SHOP_DETAILS_STALE,
  type ShopDetailDraft,
} from "@/lib/shopProfile";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual<typeof api>("@/lib/api"),
  getSupplierProfile: jest.fn(),
  updateSupplierProfile: jest.fn(),
}));

const getSupplierProfile = api.getSupplierProfile as jest.MockedFunction<
  typeof api.getSupplierProfile
>;
const updateSupplierProfile = api.updateSupplierProfile as jest.MockedFunction<
  typeof api.updateSupplierProfile
>;

const PROFILE: SupplierProfile = {
  userId: "usr_1",
  shopName: "PrintRight Davao",
  contactName: "Ben Santos",
  phone: "+639171234567",
  email: "shop@example.com",
  shop: { lat: 7.07, lng: 125.61, label: "Davao City" },
  pickupAvailable: true,
  version: 3,
  updatedAt: "2026-08-19T02:00:00.000Z",
  media: null,
};

const DRAFT: ShopDetailDraft = {
  shopName: "PrintRight Davao",
  contactName: "Ben Santos",
  phone: "+639171234567",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("loading the shop's details", () => {
  it("returns the profile GRIDGO answered with", async () => {
    getSupplierProfile.mockResolvedValue(PROFILE);

    await expect(loadShopDetails()).resolves.toEqual({ status: "ok", value: PROFILE });
  });

  // The route ships with the platform, not with this app.
  it.each([404, 405])("reads %s as not open yet rather than a failure", async (status) => {
    getSupplierProfile.mockRejectedValue(new ApiError(status, { error: "not_found" }));

    await expect(loadShopDetails()).resolves.toEqual({ status: "not_open_yet" });
  });

  it("humanizes a real failure without naming a status code", async () => {
    getSupplierProfile.mockRejectedValue(new ApiError(500, { error: "server_error" }));

    const outcome = await loadShopDetails();

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("expected a failure");
    expect(outcome.message).not.toMatch(/500|server_error|_/);
    expect(outcome.message.length).toBeGreaterThan(20);
  });

  it("says something a shop can act on when the phone is offline", async () => {
    getSupplierProfile.mockRejectedValue(new TypeError("Network request failed"));

    const outcome = await loadShopDetails();

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("expected a failure");
    expect(outcome.message).toContain("load your shop details");
  });
});

describe("saving the shop's details", () => {
  it("passes the version and only the given fields to GRIDGO", async () => {
    updateSupplierProfile.mockResolvedValue({ ...PROFILE, version: 4 });

    const outcome = await saveShopDetails(3, { shopName: "PrintRight Davao City" });

    expect(updateSupplierProfile).toHaveBeenCalledWith(3, {
      shopName: "PrintRight Davao City",
    });
    expect(outcome).toEqual({ status: "ok", value: { ...PROFILE, version: 4 } });
  });

  // A retry here would put the old name back over somebody else's correction.
  it("reads 409 as stale, not as a failure to try again", async () => {
    updateSupplierProfile.mockRejectedValue(
      new ApiError(409, {
        error: "supplier_profile_stale",
        expectedVersion: 3,
        currentVersion: 4,
      }),
    );

    await expect(saveShopDetails(3, { shopName: "x" })).resolves.toEqual({ status: "stale" });
  });

  it("reads a missing route as not open yet", async () => {
    updateSupplierProfile.mockRejectedValue(
      new ApiError(404, { error: "supplier_profile_not_found" }),
    );

    await expect(saveShopDetails(3, { shopName: "x" })).resolves.toEqual({
      status: "not_open_yet",
    });
  });

  // Three fields and one refusal: the shop should not have to guess which.
  it("puts a refusal on the field GRIDGO named", async () => {
    updateSupplierProfile.mockRejectedValue(
      new ApiError(400, {
        error: "invalid_supplier_profile",
        field: "phone",
        message: "phone must be a valid PH mobile number",
      }),
    );

    const outcome = await saveShopDetails(3, { phone: "0917" });

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("expected a failure");
    expect(outcome.field).toBe("phone");
    expect(outcome.message).toContain("mobile number");
    // The server's own sentence is not what a print shop reads.
    expect(outcome.message).not.toContain("must be a valid PH");
  });

  it("keeps a refusal it cannot place off the fields", async () => {
    updateSupplierProfile.mockRejectedValue(
      new ApiError(400, {
        error: "invalid_supplier_profile",
        field: "somethingElse",
      }),
    );

    const outcome = await saveShopDetails(3, { shopName: "x" });

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("expected a failure");
    expect(outcome.field).toBeUndefined();
  });
});

describe("what is worth sending", () => {
  it("sends nothing when nothing moved", () => {
    expect(shopDetailPatch(PROFILE, DRAFT)).toEqual({});
    expect(hasShopDetailChanges(PROFILE, DRAFT)).toBe(false);
  });

  // A patch carrying all three would overwrite a name the shop never touched.
  it("sends only the field that changed", () => {
    const patch = shopDetailPatch(PROFILE, { ...DRAFT, phone: "0917 000 1111" });

    expect(patch).toEqual({ phone: "0917 000 1111" });
  });

  it("ignores whitespace the shop cannot see", () => {
    expect(shopDetailPatch(PROFILE, { ...DRAFT, shopName: "  PrintRight Davao  " })).toEqual({});
  });

  it("trims what it does send", () => {
    expect(shopDetailPatch(PROFILE, { ...DRAFT, contactName: "  Rita Cruz " })).toEqual({
      contactName: "Rita Cruz",
    });
  });

  it("treats a shop with no number on file as an empty field", () => {
    const noPhone = { ...PROFILE, phone: null };

    expect(draftFromProfile(noPhone).phone).toBe("");
    expect(hasShopDetailChanges(noPhone, draftFromProfile(noPhone))).toBe(false);
  });
});

describe("what is still wrong with it", () => {
  it("accepts details that are ready to save", () => {
    expect(shopDetailProblems(DRAFT)).toEqual({});
  });

  it("names each missing detail and what to put there", () => {
    const problems = shopDetailProblems({ shopName: "  ", contactName: "", phone: "0917" });

    expect(problems.shopName).toContain("clients and riders");
    expect(problems.contactName).toContain("GRIDGO should talk to");
    expect(problems.phone).toContain("mobile number");
  });

  it("accepts the local form of a mobile number", () => {
    expect(shopDetailProblems({ ...DRAFT, phone: "0917 123 4567" }).phone).toBeUndefined();
  });
});

describe("what a shop is told", () => {
  it("states the two non-failures without a status code or a shrug", () => {
    for (const copy of [SHOP_DETAILS_NOT_OPEN_YET, SHOP_DETAILS_STALE]) {
      expect(copy).not.toMatch(/404|405|409|error|sorry/i);
      expect(copy).toMatch(/[.!]$/);
    }
    // Neither dead end: one says when to look again, one says what to do now.
    expect(SHOP_DETAILS_NOT_OPEN_YET).toContain("Operations");
    expect(SHOP_DETAILS_STALE).toContain("Load the latest");
  });
});
