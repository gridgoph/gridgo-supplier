import { presentAlertBody, presentAlertTitle } from "@/lib/alertStages";
import {
  countRows,
  eventsForOrder,
  graceLine,
  noticeView,
  normalizePerformance,
  onTimeLine,
  onTimeRateLabel,
  PERFORMANCE_RULES,
  performanceHref,
  presentPerformanceAlert,
  topPickView,
  warningLabel,
  type PerformanceEvent,
} from "@/lib/performance";

const HOUR = 3_600_000;

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "performance_1",
    orderId: "ord_3ff0128e105a",
    kind: "late_finish",
    at: "2026-11-02T03:00:00.000Z",
    recordedAt: "2026-11-02T03:00:30.000Z",
    reason: "Finished after the committed ready-by and one-hour grace window.",
    reasonCode: null,
    message: "Order ord_3ff0128e105a: finished 2 shop hours after the committed ready-by (minor). Warning only; no money is deducted.",
    tier: "minor",
    deadlineAt: "2026-11-02T01:00:00.000Z",
    hoursLate: 2,
    workingLateMs: 2 * HOUR,
    graceMinutes: 60,
    exempt: false,
    exemptionReason: null,
    warningCodes: ["late_finish"],
    active: true,
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    performance: {
      supplierId: "supplier_id",
      asOf: "2026-11-02T04:00:00.000Z",
      policy: "warnings_only",
      windowDays: 30,
      graceMinutes: 60,
      counts: { declines: 0, timeouts: 0, lateFinishes: 0, cancellations: 0, arrivedPacked: 0 },
      rosterReview: false,
      topPick: { hidden: false, hiddenUntil: null, allHiddenFallback: true },
      onTime: { completed: 0, onTime: 0, late: 0, rate: null },
      warnings: [],
      notices: [],
      events: [],
      ...overrides,
    },
  };
}

function normalized(overrides: Record<string, unknown> = {}) {
  const performance = normalizePerformance(body(overrides));
  if (!performance) throw new Error("expected a performance");
  return performance;
}

describe("normalizePerformance", () => {
  it("reads the contract's example", () => {
    const performance = normalized();
    expect(performance.counts.lateFinishes).toBe(0);
    expect(performance.onTime.rate).toBeNull();
    expect(performance.topPick).toEqual({ hidden: false, hiddenUntil: null });
    expect(performance.graceMinutes).toBe(60);
  });

  it("is null for a body that is not a performance", () => {
    expect(normalizePerformance(null)).toBeNull();
    expect(normalizePerformance({ performance: { counts: {} } })).toBeNull();
    expect(normalizePerformance({ error: "not_found" })).toBeNull();
  });

  it("keeps late-finish notices and drops records it cannot read", () => {
    const performance = normalized({
      notices: [event(), { id: "x" }, event({ id: "performance_2", kind: "mystery" })],
      warnings: [event(), event({ id: "performance_3", kind: "declined", tier: null, workingLateMs: null })],
    });
    expect(performance.notices.map((notice) => notice.id)).toEqual(["performance_1"]);
    expect(performance.warnings.map((warning) => warning.id)).toEqual(["performance_1", "performance_3"]);
  });

  it("keeps the exact working time rather than the rounded hours", () => {
    const performance = normalized({ notices: [event({ workingLateMs: 3_600_001, hoursLate: 1 })] });
    expect(performance.notices[0].workingLateMs).toBe(3_600_001);
  });

  it("only reports a Top Pick end date while the shop is hidden", () => {
    expect(normalized({ topPick: { hidden: false, hiddenUntil: "2026-11-09T03:00:00.000Z" } }).topPick.hiddenUntil).toBeNull();
    expect(normalized({ topPick: { hidden: true, hiddenUntil: "2026-11-09T03:00:00.000Z" } }).topPick.hiddenUntil).toBe(
      "2026-11-09T03:00:00.000Z",
    );
  });
});

describe("on-time words", () => {
  it("rounds the rate to a whole percent", () => {
    expect(onTimeRateLabel(normalized({ onTime: { completed: 3, onTime: 2, late: 1, rate: 0.6667 } }))).toBe("67%");
    expect(onTimeRateLabel(normalized())).toBeNull();
  });

  it("says so when nothing has finished in the window", () => {
    expect(onTimeLine(normalized())).toBe("No finished jobs in the last 30 days yet.");
    expect(onTimeLine(normalized({ onTime: { completed: 1, onTime: 1, late: 0, rate: 1 } }))).toBe(
      "1 of 1 finished job was ready on time in the last 30 days.",
    );
  });

  it("describes the one-hour grace window", () => {
    expect(graceLine(60)).toMatch(/within an hour of its ready-by time/);
  });
});

describe("noticeView", () => {
  function notice(overrides: Record<string, unknown> = {}): PerformanceEvent {
    return normalized({ notices: [event(overrides)] }).notices[0];
  }

  it("names the order's lateness, the reason and how late in open shop time", () => {
    const view = noticeView(notice());
    expect(view.chip.label).toBe("Minor lateness");
    expect(view.lateLine).toBe("Ready 2 hours of open shop time after its ready-by (more than an hour, up to 6 hours).");
    expect(view.reason).toMatch(/one-hour grace window/);
    expect(view.exemptLine).toBeNull();
  });

  it.each([
    ["minor", 61 * 60_000, "Minor lateness", "warning"],
    ["moderate", 6 * HOUR + 60_000, "Moderate lateness", "warning"],
    ["severe", 25 * HOUR, "Severe lateness", "error"],
  ])("says the %s tier", (tier, ms, label, tone) => {
    const view = noticeView(notice({ tier, workingLateMs: ms }));
    expect(view.chip).toEqual(expect.objectContaining({ label, tone }));
  });

  it("marks an exempt notice as not counted, with GRIDGO's reason", () => {
    const view = noticeView(notice({ exempt: true, exemptionReason: "Verified power outage" }));
    expect(view.chip).toEqual(expect.objectContaining({ label: "Not counted", tone: "neutral" }));
    expect(view.exemptLine).toBe("This job does not count toward your warnings or Top Pick: Verified power outage");
  });
});

describe("Top Pick", () => {
  it("says when a hidden shop comes back, and that it is still offered", () => {
    const view = topPickView(normalized({ topPick: { hidden: true, hiddenUntil: "2026-11-09T03:00:00.000Z" } }));
    expect(view.label).toBe("Hidden from Top Pick");
    expect(view.title).toMatch(/^Back on /);
    expect(view.body).toMatch(/still the Top Pick when no other shop can take the job/);
  });

  it("is calm when nothing holds the shop back", () => {
    expect(topPickView(normalized()).label).toBe("Shown for Top Pick");
  });
});

describe("counts and warnings", () => {
  it("lists every count GRIDGO keeps", () => {
    const rows = countRows({ declines: 3, timeouts: 2, lateFinishes: 1, cancellations: 0, arrivedPacked: 0 });
    expect(rows.map((row) => row.value)).toEqual([2, 3, 0, 1, 0]);
  });

  it("names each warning, and gives an unknown code neutral words", () => {
    expect(warningLabel("repeated_declines")).toBe("Several offers declined");
    expect(warningLabel("accepted_order_cancelled")).toBe("Cancelled after accepting");
    expect(warningLabel("something_new")).toBe("Warning");
  });

  it("finds a job's notices and warnings for the notification that opened the page", () => {
    const performance = normalized({
      notices: [event()],
      warnings: [event(), event({ id: "performance_9", orderId: "ord_other", kind: "cancelled" })],
    });
    expect([...eventsForOrder(performance, "ord_3ff0128e105a")]).toEqual(["performance_1"]);
    expect(eventsForOrder(performance, null).size).toBe(0);
    expect(performanceHref("ord_1")).toBe("/performance?orderId=ord_1");
  });
});

describe("no money words", () => {
  it("never names a deduction, a rate, a fee or a price", () => {
    const copy = [
      ...PERFORMANCE_RULES,
      topPickView(normalized()).body,
      topPickView(normalized({ topPick: { hidden: true, hiddenUntil: null } })).body,
      noticeView(normalized({ notices: [event()] }).notices[0]).lateLine,
    ].join(" ");
    expect(copy).not.toMatch(/deduct|penalt|fee|price|rate|₱|%/i);
  });
});

describe("performance alerts", () => {
  const late = {
    type: "supplier_performance_notice",
    title: "Shop performance notice",
    body: "Order ord_3ff0128e105a: finished 2.5 shop hours after the committed ready-by (minor). Reason: Finished after the committed ready-by and one-hour grace window. Warning only; no money is deducted.",
  };

  it("rewrites a late-finish notice without the raw order key or tier code", () => {
    expect(presentAlertTitle(late)).toBe("Late-finish notice");
    const text = presentAlertBody(late);
    expect(text).toMatch(/2 hours 30 minutes of open shop time/);
    expect(text).toMatch(/no money is taken/);
    expect(text).not.toMatch(/ord_|minor|deducted/);
  });

  it("rewrites a warning and a no-fault decision", () => {
    expect(
      presentPerformanceAlert({
        type: "supplier_performance_notice",
        body: "Order ord_1: Capacity is full. repeated declines. Warning only; no money is deducted.",
      })?.title,
    ).toBe("A warning on your shop's record");
    expect(
      presentPerformanceAlert({
        type: "supplier_performance_notice",
        body: "Order ord_1: Super Admin recorded a no-fault event. Reason: x. This order is excluded from performance consequences.",
      })?.title,
    ).toBe("Not counted against your shop");
  });

  it("leaves other alerts alone", () => {
    expect(presentPerformanceAlert({ type: "shop_job_assigned", body: "x" })).toBeNull();
  });
});
