import {
  canGiveBack,
  giveBackLine,
  giveBackWindow,
  homePapersOnFile,
  homePinProblems,
  homePinValue,
  homeSwitch,
  nextPinChangeLine,
  readHomePrinter,
  starterSteps,
  starterWaiting,
  verifiedMissing,
  weeklyJobsLine,
  weeklyJobsShare,
  type HomeStatus,
} from "@/lib/homePrinter";
import { homePrintsValue, DEFAULT_PRINTS, missionStates, requiredMissionsFor, shopKindOptions } from "@/lib/guidedSignup";

const STATUS: HomeStatus = {
  level: "starter",
  verified: false,
  online: true,
  offersPaused: false,
  reason: null,
  deadlineAt: "2026-12-24T00:00:00.000Z",
  weeklyJobs: 12,
  weeklyJobCap: 30,
  offlineUntil: null,
  allowHomePickup: false,
  pinConsentWording: "pin wording",
  filePrivacyWording: "file wording",
};

function status(partial: Partial<HomeStatus>): HomeStatus {
  return { ...STATUS, ...partial };
}

describe("reading GET /me/home-printer", () => {
  it("keeps GRIDGO's figures and the owner's private pin", () => {
    const read = readHomePrinter({
      version: 4,
      homePrinter: { ...STATUS, symbol: "house", printerType: "home" },
      pin: {
        point: { lat: 7.06, lng: 125.6, label: "Example street" },
        barangay: "Example barangay",
        street: "Example street",
        propertyType: "house",
        landmark: null,
        nextChangeAt: "2026-12-24T00:00:00.000Z",
      },
    });
    expect(read?.version).toBe(4);
    expect(read?.status.weeklyJobCap).toBe(30);
    expect(read?.pin.barangay).toBe("Example barangay");
    expect(read?.pin.propertyType).toBe("house");
  });

  it("reads nothing without a home status", () => {
    expect(readHomePrinter({ version: 1 })).toBeNull();
    expect(readHomePrinter(null)).toBeNull();
  });

  it("treats a missing cap as no cap", () => {
    expect(readHomePrinter({ homePrinter: { ...STATUS, weeklyJobCap: null, level: "verified" } })?.status.weeklyJobCap).toBeNull();
  });
});

describe("the To do switch", () => {
  it("is on and flippable when nothing is in the way", () => {
    expect(homeSwitch(STATUS)).toMatchObject({ on: true, canToggle: true, tone: "online", title: "You're online" });
  });

  it("is off and flippable when the printer switched off", () => {
    expect(homeSwitch(status({ online: false, reason: "home_offline" }))).toMatchObject({
      on: false,
      canToggle: true,
      tone: "offline",
    });
  });

  it("explains a pause away from home without a distance figure", () => {
    const view = homeSwitch(status({ reason: "home_away_from_pin", offersPaused: true }));
    expect(view).toMatchObject({ on: true, canToggle: true, tone: "paused" });
    expect(view.title).toBe("Offers paused: you're away from home");
    expect(view.body).not.toMatch(/\d+\s?m\b/);
  });

  it("reads as offline, not away, when the printer has not switched on", () => {
    expect(homeSwitch(status({ online: false, reason: "home_away_from_pin" }))).toMatchObject({
      on: false,
      canToggle: true,
      tone: "offline",
      title: "You're offline",
    });
  });

  it("says when a fair-play hold ends and does not let the switch clear it", () => {
    const view = homeSwitch(status({ online: false, reason: "home_fair_play_hold", offlineUntil: "2026-11-25T14:00:00.000Z" }));
    expect(view.canToggle).toBe(false);
    expect(view.title).toMatch(/^Offers paused until /);
  });

  it("sends a capped Starter to Verified, and a pending one to Starter", () => {
    expect(homeSwitch(status({ reason: "home_weekly_cap" })).action).toEqual({ label: "Get Verified", target: "levels" });
    expect(homeSwitch(status({ level: "pending", reason: "home_starter_review_required" })).action).toEqual({
      label: "Finish Starter",
      target: "levels",
    });
    expect(homeSwitch(status({ reason: "home_pin_consent_required" })).action?.target).toBe("pin");
  });

  it("never blames", () => {
    for (const reason of [
      "home_offline",
      "home_away_from_pin",
      "home_fair_play_hold",
      "home_weekly_cap",
      "home_verification_deadline",
      "home_pin_consent_required",
      "home_starter_revoked",
      "home_starter_review_required",
    ]) {
      const view = homeSwitch(status({ reason }));
      expect(`${view.title} ${view.body}`).not.toMatch(/fault|penalt|violat|bad|warning|failed/i);
    }
  });
});

describe("the weekly count", () => {
  it("is GRIDGO's count against GRIDGO's cap", () => {
    expect(weeklyJobsLine(STATUS)).toBe("12 of 30 jobs this week");
    expect(weeklyJobsLine(status({ weeklyJobs: 3, weeklyJobCap: 10 }))).toBe("3 of 10 jobs this week");
    expect(weeklyJobsShare(status({ weeklyJobs: 15, weeklyJobCap: 30 }))).toBe(0.5);
  });

  it("is not drawn once Verified", () => {
    expect(weeklyJobsLine(status({ level: "verified", verified: true, weeklyJobCap: null }))).toBeNull();
  });
});

describe("Starter", () => {
  it("lists the agreement and the three papers, done as GRIDGO has them", () => {
    const pending = status({ level: "pending", reason: "home_file_privacy_required" });
    const steps = starterSteps(pending, homePapersOnFile([{ fileId: "f1", documentType: "valid_id" }]));
    expect(steps.map((step) => [step.id, step.done])).toEqual([
      ["privacy", false],
      ["valid_id", true],
      ["id_selfie", false],
      ["sample_work", false],
    ]);
    expect(starterWaiting(pending, steps)).toBe(false);
  });

  it("waits on GRIDGO once everything is in", () => {
    const pending = status({ level: "pending", reason: "home_starter_review_required" });
    const onFile = homePapersOnFile([
      { documentType: "valid_id" },
      { references: [{ type: "user", documentType: "id_selfie" }] },
      { verificationDocumentType: "sample_work" },
    ]);
    const steps = starterSteps(pending, onFile);
    expect(steps.every((step) => step.done)).toBe(true);
    expect(starterWaiting(pending, steps)).toBe(true);
  });

  it("needs a clearance or permit, and a TIN, for Verified", () => {
    expect(verifiedMissing(homePapersOnFile([]))).toEqual({ permit: true, tin: true });
    expect(verifiedMissing(homePapersOnFile([{ documentType: "business_permit" }]))).toEqual({ permit: false, tin: true });
    expect(verifiedMissing(homePapersOnFile([{ documentType: "barangay_clearance" }, { documentType: "tin" }]))).toEqual({
      permit: false,
      tin: false,
    });
  });
});

describe("giving a job back", () => {
  const accepted = { state: "production", shopAcceptance: { status: "accepted", acceptedAt: "2026-11-24T12:00:00.000Z" } };

  it("is free up to and including five minutes after accepting", () => {
    expect(giveBackWindow(accepted as never, new Date("2026-11-24T12:04:59.000Z")).free).toBe(true);
    expect(giveBackWindow(accepted as never, new Date("2026-11-24T12:05:00.000Z")).free).toBe(true);
    expect(giveBackWindow(accepted as never, new Date("2026-11-24T12:05:01.000Z")).free).toBe(false);
  });

  it("says until when, or that it counts as late", () => {
    expect(giveBackLine(giveBackWindow(accepted as never, new Date("2026-11-24T12:01:00.000Z")))).toMatch(/^Free until /);
    expect(giveBackLine(giveBackWindow(accepted as never, new Date("2026-11-24T13:00:00.000Z")))).toBe(
      "Counts as a late give-back",
    );
  });

  it("is offered only while GRIDGO takes it", () => {
    expect(canGiveBack(accepted as never)).toBe(true);
    expect(canGiveBack({ ...accepted, state: "ready_for_dispatch" } as never)).toBe(false);
    expect(canGiveBack({ state: "production", shopAcceptance: { status: "pending" } } as never)).toBe(false);
  });
});

describe("the home pin", () => {
  const draft = {
    pin: { lat: 7.06, lng: 125.6, label: "x" },
    barangay: " Example barangay ",
    street: "Example street",
    propertyType: "house" as const,
    landmark: "",
  };

  it("names each missing part", () => {
    expect(homePinProblems({ ...draft, pin: null, barangay: "", propertyType: null }, false)).toEqual({
      pin: "Tap the map where you live.",
      barangay: "Enter your barangay.",
      propertyType: "Choose house or boarding house.",
      consent: "Tick the box to continue.",
    });
  });

  it("sends GRIDGO's shape with its exact wording, and no empty landmark", () => {
    expect(homePinValue(draft, "pin wording")).toEqual({
      point: { lat: 7.06, lng: 125.6 },
      barangay: "Example barangay",
      street: "Example street",
      propertyType: "house",
      consent: { accepted: true, wording: "pin wording" },
    });
    expect(homePinValue({ ...draft, landmark: "Blue gate" }, "w")).toMatchObject({ landmark: "Blue gate" });
    expect(homePinValue(draft, "")).toBeNull();
  });

  it("tells when the pin can move again", () => {
    const pin = { point: null, barangay: "b", street: "s", propertyType: null, landmark: null, nextChangeAt: "2026-12-24T00:00:00.000Z" };
    expect(nextPinChangeLine(pin, new Date("2026-11-24T00:00:00.000Z"))).toMatch(/^You can move your pin again on /);
    expect(nextPinChangeLine(pin, new Date("2026-12-25T00:00:00.000Z"))).toBeNull();
  });
});

describe("sign-up for a home printer", () => {
  it("offers the home choice only when GRIDGO does", () => {
    expect(shopKindOptions(false).map((o) => o.value)).toEqual(["print_shop"]);
    expect(shopKindOptions(true).map((o) => o.value)).toEqual(["print_shop", "home_printer"]);
  });

  it("prints documents only, never A3 or finishing", () => {
    expect(
      homePrintsValue({ ...DEFAULT_PRINTS, papers: ["short", "a3"], finishing: { stapling: "5", binding: "", photo_paper: "" } }),
    ).toEqual({ groups: ["documents"], documents: { papers: ["short"], colours: ["bw", "colour"], duplex: true } });
  });

  it("has no hours mission, and the rest are done by GRIDGO's record", () => {
    const signup = {
      version: 1,
      supplierId: "sup_1",
      steps: { eligibility: { shopKind: "home_printer" as const, registrantRole: "owner" as const, adult: true } },
      nextStep: "payout" as const,
    };
    expect(requiredMissionsFor(signup).map((m) => m.id)).toEqual(["shop", "pin", "prints", "staff", "paid"]);
    expect(missionStates(signup)).toMatchObject({ shop: "done", pin: "done", prints: "done", staff: "done", paid: "current" });
  });
});
