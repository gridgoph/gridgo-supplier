import * as api from "@/lib/api";
import {
  currentMission,
  DEFAULT_PRINTS,
  doneCount,
  eligibilityProblems,
  eligibilityValue,
  loadGuidedSignup,
  locationValue,
  minutesLeft,
  missionStates,
  orderedGroups,
  ownerClaimLink,
  pagePriceLine,
  philippineMobile,
  pinStepProblem,
  printsDraftFrom,
  printsProblems,
  printsValue,
  readSignup,
  readyToEnroll,
  saveSignupStep,
  setupComplete,
  shopProblems,
  shopValue,
  type GuidedSignup,
  type SignupTerms,
} from "@/lib/guidedSignup";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getGuidedSignup: jest.fn(),
    saveGuidedSignupStep: jest.fn(),
    createShopInvite: jest.fn(),
    getShopTeam: jest.fn(),
    replaceShopInvite: jest.fn(),
  };
});

const mocked = api as jest.Mocked<typeof api>;

const TERMS_BODY = {
  printGroups: ["marketing", "documents", "apparel"],
  locationConsentWording: "I agree that GRIDGO may store and use my shop location.",
  payoutConsentWording: "I authorize GRIDGO to send shop payouts to this QR account.",
  documentRates: { bwMinor: 300, colourMinor: 500 },
};

function signup(partial: Partial<GuidedSignup>): GuidedSignup {
  return { version: 1, supplierId: null, steps: {}, nextStep: "eligibility", ...partial };
}

const TERMS: SignupTerms = TERMS_BODY;

describe("step 0", () => {
  it("names every missing answer, and refuses a minor", () => {
    expect(eligibilityProblems({ shopKind: null, registrantRole: null, adult: false })).toEqual({
      shopKind: expect.any(String),
      registrantRole: expect.any(String),
      adult: "You must be 18 or older to open a shop on GRIDGO.",
    });
    expect(eligibilityValue({ shopKind: "print_shop", registrantRole: "owner", adult: false })).toBeNull();
  });

  it("sends exactly the three answers", () => {
    expect(eligibilityValue({ shopKind: "home_printer", registrantRole: "manager", adult: true })).toEqual({
      shopKind: "home_printer",
      registrantRole: "manager",
      adult: true,
    });
  });
});

describe("your shop", () => {
  it("normalises a Philippine mobile the way GRIDGO and Clerk compare it", () => {
    expect(philippineMobile("0917 123 4567")).toBe("+639171234567");
    expect(philippineMobile("+63 917-123-4567")).toBe("+639171234567");
    expect(philippineMobile("639171234567")).toBe("+639171234567");
    expect(philippineMobile("082 123 4567")).toBeNull();
  });

  it("asks for the texted code before the step can be saved", () => {
    const fields = { shopName: "Shop", contactName: "Name", phone: "09171234567", ownerPhone: "" };
    expect(shopProblems(fields, { manager: false, phoneConfirmed: false }).phone).toBe(
      "Confirm this number with the code we text you.",
    );
    expect(shopProblems(fields, { manager: false, phoneConfirmed: true })).toEqual({});
  });

  it("makes a manager give a different owner mobile", () => {
    const fields = { shopName: "Shop", contactName: "Name", phone: "09171234567", ownerPhone: "0917 123 4567" };
    expect(shopProblems(fields, { manager: true, phoneConfirmed: true }).ownerPhone).toBe(
      "Your owner's number must be different from yours.",
    );
    const ok = { ...fields, ownerPhone: "09181234567" };
    expect(shopProblems(ok, { manager: true, phoneConfirmed: true })).toEqual({});
    expect(shopValue(ok, true)).toEqual({
      shopName: "Shop",
      contactName: "Name",
      phone: "+639171234567",
      ownerPhone: "+639181234567",
    });
    expect(shopValue(ok, false)).not.toHaveProperty("ownerPhone");
  });
});

describe("pin", () => {
  const pin = { lat: 7.07, lng: 125.6, label: "Bajada, Davao City" };

  it("needs the consent tick as well as a placed pin", () => {
    expect(pinStepProblem(pin, false)).toBe("Tick the box to let GRIDGO use your pin.");
    expect(pinStepProblem(pin, true)).toBeNull();
    expect(pinStepProblem(null, true)).toMatch(/Place your shop on the map/);
  });

  it("sends GRIDGO's own consent wording back unchanged", () => {
    expect(locationValue(pin, TERMS.locationConsentWording)).toEqual({
      point: pin,
      consent: { accepted: true, wording: TERMS.locationConsentWording },
    });
  });
});

describe("what the shop prints", () => {
  it("starts with documents ticked and the common choices already right", () => {
    expect(DEFAULT_PRINTS.groups).toEqual(["documents"]);
    expect(DEFAULT_PRINTS.papers).toEqual(["short", "a4", "long"]);
    expect(DEFAULT_PRINTS.colours).toEqual(["bw", "colour"]);
    expect(DEFAULT_PRINTS.duplex).toBe(true);
    expect(printsProblems(DEFAULT_PRINTS)).toEqual({});
  });

  it("puts documents first in GRIDGO's own group list", () => {
    expect(orderedGroups(TERMS.printGroups)).toEqual(["documents", "marketing", "apparel"]);
  });

  it("shows GRIDGO's fixed page price, never a typed one", () => {
    expect(pagePriceLine(TERMS, "bw")).toBe("₱3.00 a side");
    expect(pagePriceLine(TERMS, "colour")).toBe("₱5.00 a side");
  });

  it("asks for an A3 price per ticked colour", () => {
    const a3 = { ...DEFAULT_PRINTS, papers: ["a4", "a3"] as const, colours: ["bw", "colour"] as const };
    const draft = { ...a3, papers: [...a3.papers], colours: [...a3.colours] };
    expect(printsProblems(draft).a3).toEqual({
      bw: "Set your A3 price per side.",
      colour: "Set your A3 price per side.",
    });
    const priced = { ...draft, a3Prices: { bw: "12", colour: "25.50" } };
    expect(printsProblems(priced)).toEqual({});
    expect(printsValue(priced)).toEqual({
      groups: ["documents"],
      documents: {
        papers: ["a4", "a3"],
        colours: ["bw", "colour"],
        duplex: true,
        a3PricesMinor: { bw: 1200, colour: 2550 },
      },
    });
  });

  it("sends only the finishing the shop priced, and refuses ₱0", () => {
    const draft = { ...DEFAULT_PRINTS, finishing: { stapling: "5", binding: "", photo_paper: "0" } };
    expect(printsProblems(draft).finishing).toEqual({ photo_paper: "Enter a price above ₱0, or leave it empty." });
    const fixed = { ...draft, finishing: { ...draft.finishing, photo_paper: "" } };
    expect((printsValue(fixed).documents as { finishing: unknown }).finishing).toEqual({ stapling: 500 });
  });

  it("needs a paper and a colour, and sends no documents block without documents", () => {
    expect(printsProblems({ ...DEFAULT_PRINTS, papers: [], colours: [] })).toMatchObject({
      papers: "Tick at least one paper size.",
      colours: "Tick black & white, colour, or both.",
    });
    expect(printsValue({ ...DEFAULT_PRINTS, groups: ["apparel"] })).toEqual({ groups: ["apparel"] });
  });

  it("reads a saved step back for resume", () => {
    const draft = printsDraftFrom({
      groups: ["documents"],
      documents: { papers: ["a3"], colours: ["bw"], duplex: false, a3PricesMinor: { bw: 1500 } },
    });
    expect(draft).toMatchObject({ papers: ["a3"], colours: ["bw"], duplex: false, a3Prices: { bw: "15", colour: "" } });
  });
});

describe("missions", () => {
  it("lights the first unfinished mission before the shop exists", () => {
    const s = signup({ steps: { eligibility: { shopKind: "print_shop", registrantRole: "owner", adult: true } }, nextStep: "shop" });
    expect(currentMission(s)?.id).toBe("shop");
    expect(doneCount(s)).toBe(0);
    expect(minutesLeft(s)).toBe(5);
  });

  it("follows GRIDGO's saved steps, whatever order they were saved in", () => {
    const s = signup({
      steps: {
        eligibility: { shopKind: "print_shop", registrantRole: "owner", adult: true },
        shop: { shopName: "S", contactName: "C", phone: "+639171234567" },
        prints: { groups: ["documents"] },
      },
      nextStep: "location",
    });
    expect(missionStates(s)).toMatchObject({ shop: "done", pin: "current", prints: "done", staff: "later" });
    expect(readyToEnroll(s)).toBe(false);
    expect(readyToEnroll({ ...s, nextStep: "enroll" })).toBe(true);
  });

  it("after enrollment, reads progress from nextStep", () => {
    const hours = signup({ supplierId: "sup_1", nextStep: "hours" });
    expect(missionStates(hours)).toMatchObject({ staff: "done", hours: "current", paid: "later" });
    expect(currentMission(signup({ supplierId: "sup_1", nextStep: "payout" }))?.id).toBe("paid");
    expect(setupComplete(signup({ supplierId: "sup_1", nextStep: "listing_photos" }))).toBe(true);
    expect(doneCount(signup({ supplierId: "sup_1", nextStep: "complete" }))).toBe(6);
  });

  it("a manager's payouts wait for the owner, not on the manager", () => {
    const s = signup({ supplierId: "sup_1", nextStep: "owner_claim" });
    expect(missionStates(s).paid).toBe("waiting");
    expect(currentMission(s)).toBeNull();
    expect(setupComplete(s)).toBe(false);
  });
});

describe("calls", () => {
  beforeEach(() => jest.resetAllMocks());

  it("reads a GRIDGO without guided sign-up as not open yet", async () => {
    mocked.getGuidedSignup.mockRejectedValue(new api.ApiError(404, { error: "not_found" }));
    await expect(loadGuidedSignup()).resolves.toEqual({ status: "not_open_yet" });
  });

  it("reads the draft and GRIDGO's wording", async () => {
    mocked.getGuidedSignup.mockResolvedValue({ signup: { version: 0, steps: {}, nextStep: "eligibility" }, ...TERMS_BODY });
    const read = await loadGuidedSignup();
    expect(read).toMatchObject({ status: "ok", terms: { documentRates: { bwMinor: 300 } } });
  });

  it("turns refusals into sentences a shop can act on", async () => {
    mocked.saveGuidedSignupStep.mockRejectedValue(
      new api.ApiError(403, { error: "shop_mobile_verification_required" }),
    );
    await expect(saveSignupStep(1, "shop", {})).resolves.toEqual({
      status: "failed",
      message: "Confirm your mobile number with the code we text you first.",
    });
    mocked.saveGuidedSignupStep.mockRejectedValue(new api.ApiError(409, { error: "supplier_signup_stale" }));
    await expect(saveSignupStep(1, "shop", {})).resolves.toEqual({ status: "stale" });
    mocked.saveGuidedSignupStep.mockRejectedValue(
      new api.ApiError(400, { error: "invalid_supplier_signup", field: "ownerPhone" }),
    );
    await expect(saveSignupStep(1, "shop", {})).resolves.toMatchObject({ field: "ownerPhone" });
  });

  it("replaces an open owner link instead of failing", async () => {
    mocked.createShopInvite.mockRejectedValue(new api.ApiError(409, { error: "shop_owner_invite_exists" }));
    mocked.getShopTeam.mockResolvedValue({
      invites: [{ id: "inv_1", kind: "owner", status: "open" }],
    } as unknown as Awaited<ReturnType<typeof api.getShopTeam>>);
    mocked.replaceShopInvite.mockResolvedValue({ invite: {} as never, token: "tok_new" });
    await expect(ownerClaimLink()).resolves.toEqual({ status: "ok", token: "tok_new" });
    expect(mocked.replaceShopInvite).toHaveBeenCalledWith("inv_1");
  });

  it("keeps unknown steps safe", () => {
    expect(readSignup({ version: 2, steps: {}, nextStep: "something_new" })?.nextStep).toBe("eligibility");
    expect(readSignup(null)).toBeNull();
  });
});
