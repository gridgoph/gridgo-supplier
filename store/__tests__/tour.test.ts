import AsyncStorage from "@react-native-async-storage/async-storage";

import { useTour } from "@/store/tour";

/**
 * The tour's memory: once per account on this phone, gone for good on Skip or
 * Done, back on Replay.
 */

beforeEach(() => {
  useTour.getState().reset();
  useTour.setState({ hydrated: true, focusToken: 0 });
});

const progress = (accountId: string) => useTour.getState().progress[accountId];

describe("once only", () => {
  it("starts for a new shop and does not start again once finished", () => {
    const tour = useTour.getState();
    tour.autoStart("usr_a", true);
    expect(progress("usr_a")).toEqual({ status: "active", step: 0 });

    for (let step = 0; step < 9; step++) useTour.getState().next("usr_a");
    expect(progress("usr_a")).toEqual({ status: "done" });

    useTour.getState().autoStart("usr_a", true);
    expect(progress("usr_a")).toEqual({ status: "done" });
  });

  it("does not restart a tour that is under way", () => {
    useTour.getState().autoStart("usr_a", true);
    useTour.getState().next("usr_a");
    useTour.getState().autoStart("usr_a", true);
    expect(progress("usr_a")).toEqual({ status: "active", step: 1 });
  });

  it("never starts on its own for a shop that already has jobs", () => {
    useTour.getState().autoStart("usr_a", false);
    expect(progress("usr_a")).toBeUndefined();
  });

  it("waits for the phone's record to load before deciding", () => {
    useTour.setState({ hydrated: false });
    useTour.getState().autoStart("usr_a", true);
    expect(progress("usr_a")).toBeUndefined();
  });

  it("is kept per account, so a second shop on the same counter phone still gets it", () => {
    useTour.getState().autoStart("usr_a", true);
    useTour.getState().skip("usr_a");
    useTour.getState().autoStart("usr_b", true);
    expect(progress("usr_a")).toEqual({ status: "done" });
    expect(progress("usr_b")).toEqual({ status: "active", step: 0 });
  });

  it("persists what each account has seen, and nothing about the screen", async () => {
    useTour.getState().autoStart("usr_a", true);
    useTour.getState().skip("usr_a");
    useTour.getState().setRect("home.jobsTab", { x: 1, y: 2, width: 3, height: 4 });

    const stored = await AsyncStorage.getItem("gridgo.supplier.tour.v1");
    expect(JSON.parse(stored ?? "{}").state).toEqual({ progress: { usr_a: { status: "done" } } });
  });
});

describe("skip", () => {
  it("ends the tour from the middle and keeps it ended", () => {
    useTour.getState().autoStart("usr_a", true);
    useTour.getState().next("usr_a");
    useTour.getState().next("usr_a");
    useTour.getState().skip("usr_a");
    expect(progress("usr_a")).toEqual({ status: "done" });

    useTour.getState().arrive("usr_a", "listing");
    expect(progress("usr_a")).toEqual({ status: "done" });
  });
});

describe("replay", () => {
  it("starts a finished tour over from the first step", () => {
    useTour.getState().autoStart("usr_a", true);
    useTour.getState().skip("usr_a");
    useTour.getState().replay("usr_a");
    expect(progress("usr_a")).toEqual({ status: "active", step: 0 });
  });

  it("works for a shop the tour never started for", () => {
    useTour.getState().replay("usr_a");
    expect(progress("usr_a")).toEqual({ status: "active", step: 0 });
  });
});

describe("screens", () => {
  it("moves the tour up to the screen the shop reached", () => {
    useTour.getState().autoStart("usr_a", true);
    useTour.getState().arrive("usr_a", "schedule");
    expect(useTour.getState().screen).toBe("schedule");
    expect(progress("usr_a")).toEqual({ status: "active", step: 3 });
  });

  it("lets only the latest focus clear the screen", () => {
    const first = useTour.getState().arrive("usr_a", "jobs");
    const second = useTour.getState().arrive("usr_a", "jobs");
    useTour.getState().leave(first);
    expect(useTour.getState().screen).toBe("jobs");
    useTour.getState().leave(second);
    expect(useTour.getState().screen).toBeNull();
  });

  it("back stays on the screen it was asked from", () => {
    useTour.getState().autoStart("usr_a", true);
    useTour.getState().back("usr_a");
    expect(progress("usr_a")).toEqual({ status: "active", step: 0 });
    // Home's one step is followed by Jobs' first; Back from there goes nowhere.
    useTour.getState().next("usr_a");
    useTour.getState().back("usr_a");
    expect(progress("usr_a")).toEqual({ status: "active", step: 1 });
    // Within Jobs it steps back.
    useTour.getState().next("usr_a");
    useTour.getState().back("usr_a");
    expect(progress("usr_a")).toEqual({ status: "active", step: 1 });
  });

  it("moves past Add a listing when the shop taps the lit add control", () => {
    useTour.getState().replay("usr_a");
    useTour.getState().arrive("usr_a", "catalogue");
    useTour.getState().complete("usr_a", "catalogue.add");
    expect(progress("usr_a")).toEqual({ status: "active", step: 6 });
    // Back on the board after adding: the edit step, not "add" again.
    useTour.getState().arrive("usr_a", "catalogue");
    expect(progress("usr_a")).toEqual({ status: "active", step: 6 });
  });
});
