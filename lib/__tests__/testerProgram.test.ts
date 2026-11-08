import type { TesterProgramState } from "@/lib/api";
import {
  FEEDBACK_COOLDOWN_MS,
  feedbackAllowed,
  feedbackToShow,
  PLAN_DAYS,
  manilaDateOf,
  meterCells,
  reminderPlan,
  streakLabel,
  testerCardView,
} from "@/lib/testerProgram";

function tester(overrides: Partial<Extract<TesterProgramState, { enrolled: true }>> = {}): TesterProgramState {
  return {
    enrolled: true,
    app: "supplier",
    day: 3,
    streak: 3,
    checkedInToday: true,
    runComplete: false,
    stopped: false,
    manilaDate: "2026-11-07",
    nudge: null,
    ...overrides,
  };
}

const at = (iso: string) => Date.parse(iso);

describe("testerCardView", () => {
  it("draws nothing for an account that is not enrolled, or before an answer", () => {
    expect(testerCardView({ enrolled: false })).toBeNull();
    expect(testerCardView(null)).toBeNull();
  });

  it("shows Day N and the streak as GRIDGO counts them", () => {
    expect(testerCardView(tester())).toEqual({ kind: "check_in", day: 3, streak: 3, checkedIn: true });
    expect(testerCardView(tester({ day: 4, streak: 3, checkedInToday: false }))).toEqual({
      kind: "check_in",
      day: 4,
      streak: 3,
      checkedIn: false,
    });
    // After a missed day the run starts again at Day 1.
    expect(testerCardView(tester({ day: 1, streak: 0, checkedInToday: false }))).toMatchObject({ day: 1, streak: 0 });
  });

  it("shows the full meter on the fourteenth day only, and nothing once stopped", () => {
    const complete = tester({ day: 14, streak: 14, runComplete: true, stopped: true });
    expect(testerCardView(complete)).toEqual({ kind: "complete" });
    expect(testerCardView({ ...complete, checkedInToday: false } as TesterProgramState)).toBeNull();
    // Production approval stops the program without completing the run.
    expect(testerCardView(tester({ stopped: true }))).toBeNull();
  });
});

describe("meterCells and streakLabel", () => {
  it("fills the kept days and leaves today's square open until it is in", () => {
    expect(meterCells(2, false).slice(0, 4)).toEqual(["done", "done", "today", "ahead"]);
    expect(meterCells(3, true).slice(0, 4)).toEqual(["done", "done", "done", "ahead"]);
    expect(meterCells(14, true)).toEqual(Array(14).fill("done"));
    expect(meterCells(0, false)[0]).toBe("today");
  });

  it("says the streak plainly", () => {
    expect(streakLabel(0)).toBe("No streak yet");
    expect(streakLabel(1)).toBe("1-day streak");
    expect(streakLabel(7)).toBe("7-day streak");
  });
});

describe("manilaDateOf", () => {
  it("rolls over at Manila midnight, 16:00 UTC", () => {
    expect(manilaDateOf(at("2026-11-07T15:59:59Z"))).toBe("2026-11-07");
    expect(manilaDateOf(at("2026-11-07T16:00:00Z"))).toBe("2026-11-08");
  });
});

describe("reminderPlan", () => {
  it("reminds at 7 PM Manila on a day not yet in, then assumes a miss", () => {
    const plan = reminderPlan(tester({ day: 4, streak: 3, checkedInToday: false }), at("2026-11-07T02:00:00Z"));
    expect(plan[0]).toMatchObject({ at: at("2026-11-07T11:00:00Z"), title: "Day 4 of 14", body: "Open GRIDGO for 1 minute." });
    // The next morning's catch-up at 8 AM Manila, then Day 1 that evening.
    expect(plan[1]).toMatchObject({ at: at("2026-11-08T00:00:00Z"), title: "Missed yesterday" });
    expect(plan[2]).toMatchObject({ at: at("2026-11-08T11:00:00Z"), title: "Day 1 of 14" });
    // One catch-up only, then an evening a day for the next 30 days.
    expect(plan.filter((r) => r.title === "Missed yesterday")).toHaveLength(1);
    expect(plan).toHaveLength(PLAN_DAYS + 1);
    expect(new Set(plan.map((r) => r.id)).size).toBe(plan.length);
  });

  it("moves to tomorrow evening once today is in", () => {
    const plan = reminderPlan(tester({ day: 3, streak: 3, checkedInToday: true }), at("2026-11-07T02:00:00Z"));
    expect(plan[0]).toMatchObject({ at: at("2026-11-08T11:00:00Z"), title: "Day 4 of 14" });
    expect(plan.some((r) => r.at < at("2026-11-08T00:00:00Z"))).toBe(false);
  });

  it("skips tonight's reminder when it is already past 7 PM, across Manila midnight", () => {
    // 23:59 in Manila, not checked in: tonight is gone; the catch-up is 8 hours away.
    const late = reminderPlan(tester({ day: 4, streak: 3, checkedInToday: false }), at("2026-11-07T15:59:00Z"));
    expect(late[0]).toMatchObject({ at: at("2026-11-08T00:00:00Z"), title: "Missed yesterday" });
    // 00:01 in Manila: GRIDGO's answer is a new day, Day 1 after the miss.
    const next = reminderPlan(
      tester({ day: 1, streak: 0, checkedInToday: false, manilaDate: "2026-11-08" }),
      at("2026-11-07T16:01:00Z"),
    );
    expect(next[0]).toMatchObject({ at: at("2026-11-08T11:00:00Z"), title: "Day 1 of 14" });
  });

  it("lands on 7 PM Manila whatever time zone the phone is in", () => {
    const plan = reminderPlan(tester({ day: 4, streak: 3, checkedInToday: false }), at("2026-11-07T02:00:00Z"));
    const evening = plan[0].at;
    const wallClock = (timeZone: string) =>
      new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(evening);
    expect(wallClock("Asia/Manila")).toBe("19");
    // The same instant is morning in Los Angeles and noon in London: one moment, not "7 PM local".
    expect(wallClock("America/Los_Angeles")).toBe("03");
    expect(wallClock("Europe/London")).toBe("11");
  });

  it("plans the same instants when the phone's own clock is in another time zone", () => {
    // reminderPlan reads no local time: GRIDGO's Manila date and an absolute now.
    const state = tester({ day: 4, streak: 3, checkedInToday: false });
    const now = at("2026-11-07T02:00:00Z");
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      const newYork = reminderPlan(state, now);
      process.env.TZ = "Asia/Tokyo";
      const tokyo = reminderPlan(state, now);
      expect(newYork.map((r) => r.at)).toEqual(tokyo.map((r) => r.at));
      expect(newYork[0].at).toBe(at("2026-11-07T11:00:00Z"));
    } finally {
      process.env.TZ = original;
    }
  });

  it("puts the next-morning catch-up at 8 AM Manila, after Manila midnight", () => {
    const plan = reminderPlan(tester({ day: 9, streak: 8, checkedInToday: true }), at("2026-11-07T12:00:00Z"));
    const catchUp = plan.find((r) => r.title === "Missed yesterday");
    expect(catchUp && manilaDateOf(catchUp.at)).toBe("2026-11-09");
    expect(plan[0]).toMatchObject({ title: "Day 10 of 14", at: at("2026-11-08T11:00:00Z") });
  });

  it("keeps reminding past the first week of an absence, within the phone's limit", () => {
    // Checked in on 7 Nov, then the app is never opened again (review of gridgo-client#404).
    const plan = reminderPlan(tester({ day: 1, streak: 1, checkedInToday: true }), at("2026-11-07T02:00:00Z"));
    expect(plan.some((r) => r.at >= at("2026-11-15T00:00:00Z"))).toBe(true);
    expect(plan.filter((r) => r.at >= at("2026-12-01T00:00:00Z")).every((r) => r.title === "Day 1 of 14")).toBe(true);
    // iOS keeps at most 64 pending local notifications per app.
    expect(plan.length).toBeLessThanOrEqual(64);
    // Every evening is still 7 PM Manila.
    expect(plan.filter((r) => r.title !== "Missed yesterday").every((r) => new Date(r.at).getUTCHours() === 11)).toBe(true);
  });

  it("rolls 30 evenings ahead, ending only after 30 days with no open", () => {
    const plan = reminderPlan(tester({ day: 1, streak: 1, checkedInToday: true }), at("2026-11-07T02:00:00Z"));
    const evenings = plan.filter((r) => r.title !== "Missed yesterday");
    expect(evenings).toHaveLength(30);
    // 8 Nov to 7 Dec, nothing after, and never the evening already checked in (7 Nov).
    expect(evenings[0].at).toBe(at("2026-11-08T11:00:00Z"));
    expect(evenings[evenings.length - 1].at).toBe(at("2026-12-07T11:00:00Z"));
    expect(plan.some((r) => r.at === at("2026-11-07T11:00:00Z"))).toBe(false);
    // An open re-plans: a later open pushes the end out again.
    const later = reminderPlan(tester({ day: 1, streak: 0, checkedInToday: false, manilaDate: "2026-12-01" }), at("2026-12-01T02:00:00Z"));
    expect(Math.max(...later.map((r) => r.at))).toBe(at("2026-12-30T11:00:00Z"));
  });

  it("plans nothing for a non-tester, a finished run or a production-approved app", () => {
    const now = at("2026-11-07T02:00:00Z");
    expect(reminderPlan({ enrolled: false }, now)).toEqual([]);
    expect(reminderPlan(null, now)).toEqual([]);
    expect(reminderPlan(tester({ stopped: true }), now)).toEqual([]);
    expect(reminderPlan(tester({ day: 14, streak: 14, runComplete: true, stopped: true }), now)).toEqual([]);
    expect(reminderPlan(tester({ day: 14, streak: 14, checkedInToday: true }), now)).toEqual([]);
  });
});

describe("feedbackAllowed", () => {
  it("asks only once today is in, and never after production approval", () => {
    expect(feedbackAllowed(tester())).toBe(true);
    expect(feedbackAllowed(tester({ checkedInToday: false }))).toBe(false);
    // Production approval: stopped without a finished run.
    expect(feedbackAllowed(tester({ stopped: true }))).toBe(false);
    // A finished run keeps its fourteenth-day ask.
    expect(feedbackAllowed(tester({ day: 14, streak: 14, runComplete: true, stopped: true }))).toBe(true);
    // Approval wins over completion; a GRIDGO without the field reads as not approved.
    expect(feedbackAllowed(tester({ day: 14, streak: 14, runComplete: true, stopped: true, productionApproved: true }))).toBe(false);
    expect(feedbackAllowed(tester({ day: 14, streak: 14, runComplete: true, stopped: true, productionApproved: false }))).toBe(true);
    expect(feedbackAllowed(tester({ stopped: true, productionApproved: true }))).toBe(false);
    expect(feedbackAllowed({ enrolled: false })).toBe(false);
    expect(feedbackAllowed(null)).toBe(false);
  });
});

describe("feedbackToShow", () => {
  const now = at("2026-11-07T12:00:00Z");

  it("shows a nudge GRIDGO offers, fresh, and nothing without one", () => {
    expect(feedbackToShow({ trigger: "streak_3" }, null, "u1", now)).toEqual({ trigger: "streak_3", fresh: true });
    expect(feedbackToShow(null, null, "u1", now)).toBeNull();
    expect(feedbackToShow({ trigger: "streak_3" }, null, null, now)).toBeNull();
  });

  it("holds a shown card until it is closed, after GRIDGO stops offering it", () => {
    const held = { userId: "u1", trigger: "streak_3" as const, shownAt: now - 3_600_000, closed: false };
    expect(feedbackToShow(null, held, "u1", now)).toEqual({ trigger: "streak_3", fresh: false });
  });

  it("shows at most one card per 72 hours, and a closed card stays closed", () => {
    const closed = { userId: "u1", trigger: "streak_3" as const, shownAt: now - 3_600_000, closed: true };
    expect(feedbackToShow({ trigger: "completed_order" }, closed, "u1", now)).toBeNull();
    expect(feedbackToShow({ trigger: "completed_order" }, closed, "u1", now - 3_600_000 + FEEDBACK_COOLDOWN_MS)).toEqual({
      trigger: "completed_order",
      fresh: true,
    });
  });

  it("keeps the card held for at most 72 hours, then offers GRIDGO's next one", () => {
    const open = { userId: "u1", trigger: "streak_3" as const, shownAt: now, closed: false };
    expect(feedbackToShow({ trigger: "streak_10" }, open, "u1", now + FEEDBACK_COOLDOWN_MS - 1)).toEqual({
      trigger: "streak_3",
      fresh: false,
    });
    expect(feedbackToShow({ trigger: "streak_10" }, open, "u1", now + FEEDBACK_COOLDOWN_MS)).toEqual({
      trigger: "streak_10",
      fresh: true,
    });
    expect(feedbackToShow(null, open, "u1", now + FEEDBACK_COOLDOWN_MS)).toBeNull();
  });

  it("never carries one account's card to another", () => {
    const held = { userId: "u1", trigger: "streak_3" as const, shownAt: now, closed: false };
    expect(feedbackToShow(null, held, "u2", now)).toBeNull();
  });
});

describe("a tapped reminder", () => {
  it("opens Home, where the check-in card is", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parsePushData, pushTargetRoute } = require("@/lib/push");
    expect(pushTargetRoute(parsePushData({ type: "tester_reminder" }))).toBe("/(tabs)/home");
  });
});
