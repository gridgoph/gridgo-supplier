import {
  arriveAt,
  backStep,
  canGoBack,
  completeStep,
  currentStep,
  fitHoleAbove,
  nextLabel,
  nextStep,
  placeCard,
  shouldAutoStart,
  skipTour,
  startTour,
  stepPosition,
  TAB_TOUR_STEPS,
  TOUR_LENGTH,
  TOUR_STEPS,
  visibleStep,
  type TourProgress,
} from "@/lib/tour";

const at = (id: string): TourProgress => ({
  status: "active",
  step: TOUR_STEPS.findIndex((step) => step.id === id),
});

describe("the steps", () => {
  it("walk a new shop from where jobs arrive to editing its catalogue", () => {
    expect(TOUR_STEPS.map((step) => step.id)).toEqual([
      "home.jobsTab",
      "jobs.list",
      "jobs.scheduleTab",
      "schedule.calendar",
      "schedule.catalogueTab",
      "catalogue.add",
      "catalogue.edit",
      "listing.price",
      "listing.options",
    ]);
    expect(TOUR_STEPS.map((step) => step.screen)).toEqual([
      "home",
      "jobs",
      "jobs",
      "schedule",
      "schedule",
      "catalogue",
      "catalogue",
      "listing",
      "listing",
    ]);
  });

  it("cover receiving a job, scheduled jobs, and adding and editing listings", () => {
    const text = (id: string) => {
      const step = TOUR_STEPS.find((entry) => entry.id === id)!;
      return `${step.title} ${step.body}`;
    };
    expect(text("jobs.list")).toMatch(/Accept/);
    expect(text("schedule.calendar")).toMatch(/scheduled/);
    expect(text("catalogue.add")).toMatch(/Add a listing/);
    expect(text("catalogue.edit")).toMatch(/Edit/);
    expect(text("listing.price")).toMatch(/price/);
    expect(text("listing.options")).toMatch(/option/);
  });

  it("keep every instruction short", () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeLessThanOrEqual(32);
      expect(step.body.length).toBeLessThanOrEqual(120);
    }
  });

  it("never put a peso figure or GRIDGO's cut in front of a shop", () => {
    for (const step of TOUR_STEPS) {
      expect(`${step.title} ${step.body}`).not.toMatch(/₱|PHP|\d|commission|fee|GRIDGO's/i);
    }
  });

  it("light each tab from the screen before it, so the shop taps the real tab", () => {
    for (const [tab, id] of Object.entries(TAB_TOUR_STEPS)) {
      const index = TOUR_STEPS.findIndex((step) => step.id === id);
      const tabScreen = tab === "catalogues" ? "catalogue" : tab;
      expect(TOUR_STEPS[index + 1]?.screen).toBe(tabScreen);
    }
  });
});

describe("starting", () => {
  it("starts on its own once, for a new shop with no tour on record", () => {
    expect(shouldAutoStart(undefined, true)).toBe(true);
    expect(shouldAutoStart(undefined, false)).toBe(false);
  });

  it("never starts on its own again, finished or skipped", () => {
    expect(shouldAutoStart({ status: "done" }, true)).toBe(false);
    expect(shouldAutoStart(startTour(), true)).toBe(false);
  });

  it("starts at the first step, on Home", () => {
    expect(currentStep(startTour())?.id).toBe("home.jobsTab");
  });
});

describe("next", () => {
  it("moves one step at a time and ends after the last", () => {
    let progress = startTour();
    const seen: string[] = [];
    while (progress.status === "active") {
      seen.push(currentStep(progress)!.id);
      progress = nextStep(progress);
    }
    expect(seen).toEqual(TOUR_STEPS.map((step) => step.id));
    expect(progress).toEqual({ status: "done" });
  });

  it("says Next within a screen, Got it before another screen, Done at the end", () => {
    expect(nextLabel(at("home.jobsTab"))).toBe("Got it");
    expect(nextLabel(at("jobs.list"))).toBe("Next");
    expect(nextLabel(at("jobs.scheduleTab"))).toBe("Got it");
    expect(nextLabel(at("catalogue.add"))).toBe("Next");
    expect(nextLabel(at("catalogue.edit"))).toBe("Got it");
    expect(nextLabel(at("listing.options"))).toBe("Done");
  });

  it("leaves a finished tour finished", () => {
    expect(nextStep({ status: "done" })).toEqual({ status: "done" });
  });
});

describe("using the lit control", () => {
  it("moves past the step whose control the shop used", () => {
    expect(completeStep(at("catalogue.add"), "catalogue.add")).toEqual(at("catalogue.edit"));
  });

  it("changes nothing when that step is not the one showing", () => {
    expect(completeStep(at("catalogue.edit"), "catalogue.add")).toEqual(at("catalogue.edit"));
    expect(completeStep({ status: "done" }, "catalogue.add")).toEqual({ status: "done" });
  });
});

describe("back", () => {
  it("steps back within the screen the shop is on", () => {
    expect(canGoBack(at("jobs.scheduleTab"))).toBe(true);
    expect(backStep(at("jobs.scheduleTab"))).toEqual(at("jobs.list"));
    expect(backStep(at("listing.options"))).toEqual(at("listing.price"));
  });

  it("never reaches back to a step on another screen, because the tour does not navigate", () => {
    expect(canGoBack(at("home.jobsTab"))).toBe(false);
    expect(canGoBack(at("jobs.list"))).toBe(false);
    expect(backStep(at("catalogue.add"))).toEqual(at("catalogue.add"));
  });
});

describe("skip", () => {
  it("ends the tour from any step", () => {
    for (const step of TOUR_STEPS) {
      expect(skipTour()).toEqual({ status: "done" });
      expect(visibleStep(skipTour(), step.screen)).toBeNull();
    }
  });
});

describe("where a step shows", () => {
  it("only on its own screen", () => {
    expect(visibleStep(at("schedule.calendar"), "schedule")?.id).toBe("schedule.calendar");
    expect(visibleStep(at("schedule.calendar"), "home")).toBeNull();
    expect(visibleStep(at("schedule.calendar"), null)).toBeNull();
    expect(visibleStep(undefined, "home")).toBeNull();
  });

  it("waits for the shop to reach a later screen rather than taking it there", () => {
    const progress = nextStep(at("catalogue.edit"));
    expect(currentStep(progress)?.screen).toBe("listing");
    expect(visibleStep(progress, "catalogue")).toBeNull();
    expect(visibleStep(progress, "listing")?.id).toBe("listing.price");
  });

  it("moves up to meet a shop that tapped ahead", () => {
    expect(arriveAt(at("home.jobsTab"), "jobs")).toEqual(at("jobs.list"));
    expect(arriveAt(at("home.jobsTab"), "catalogue")).toEqual(at("catalogue.add"));
  });

  it("stays quiet on a screen it has already passed", () => {
    expect(arriveAt(at("catalogue.add"), "home")).toEqual(at("catalogue.add"));
    expect(visibleStep(arriveAt(at("catalogue.add"), "home"), "home")).toBeNull();
  });

  it("does not come back to life when a finished tour's screens are visited", () => {
    expect(arriveAt({ status: "done" }, "catalogue")).toEqual({ status: "done" });
  });
});

it("reports its position for the dots", () => {
  expect(stepPosition(at("schedule.calendar"))).toEqual({ index: 3, count: TOUR_LENGTH });
});

describe("placing the card", () => {
  const base = { cardHeight: 200, windowHeight: 800, insetTop: 40, insetBottom: 20 };

  it("goes under the lit control when it fits", () => {
    expect(placeCard({ ...base, target: { x: 16, y: 100, width: 300, height: 50 } })).toEqual({
      top: 166,
      side: "below",
    });
  });

  it("goes over a control near the bottom, like a tab", () => {
    expect(placeCard({ ...base, target: { x: 0, y: 700, width: 78, height: 80 } })).toEqual({
      top: 484,
      side: "above",
    });
  });

  it("pins to the bottom when the control fills the screen, or there is none", () => {
    const pinned = { top: 564, side: "pinned" };
    expect(placeCard({ ...base, target: { x: 0, y: 100, width: 390, height: 600 } })).toEqual(pinned);
    expect(placeCard({ ...base, target: null })).toEqual(pinned);
  });
});

describe("fitting the light above a pinned card", () => {
  const hole = { x: 10, y: 150, width: 370, height: 560 };

  it("stops the cut-out above the card", () => {
    expect(fitHoleAbove(hole, 600)).toEqual({ ...hole, height: 438 });
  });

  it("leaves a hole that already clears the card", () => {
    expect(fitHoleAbove({ ...hole, height: 100 }, 600)).toEqual({ ...hole, height: 100 });
  });

  it("leaves it alone when too little would be left to light", () => {
    expect(fitHoleAbove(hole, 190)).toEqual(hole);
  });
});
