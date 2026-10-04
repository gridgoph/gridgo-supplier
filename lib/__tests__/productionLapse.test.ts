import {
  cappedDeductionMinor,
  formatLateness,
  formatRate,
  lapseForOrder,
  lapseNotice,
  lapseStandingLine,
  normalizeLapses,
  penaltyRates,
  presentLapseAlert,
  type ProductionLapse,
} from "@/lib/productionLapse";
import { presentAlertBody, presentAlertTitle } from "@/lib/alertStages";

const DEADLINE = "2026-10-01T02:00:00.000Z";
const HOUR = 3_600_000;

function lapse(partial: Partial<ProductionLapse> = {}): ProductionLapse {
  return {
    id: "lapse_1",
    orderId: "ord_1",
    deadlineAt: DEADLINE,
    detectedAt: "2026-10-01T03:00:00.000Z",
    tier: "minor",
    rateBps: 500,
    warnings: [{ tier: "minor", at: "2026-10-01T03:00:00.000Z", formal: false }],
    remainingBalanceMinor: 0,
    deductionMinor: 0,
    appliedAt: null,
    closedAt: null,
    reassignmentEligible: false,
    status: "warning_only",
    ...partial,
  };
}

const at = (hoursLate: number) => new Date(Date.parse(DEADLINE) + hoursLate * HOUR);

describe("normalizeLapses", () => {
  it("reads GRIDGO's records newest first and drops what it cannot read", () => {
    const lapses = normalizeLapses({
      supplierId: "user_supplier",
      lapses: [
        { id: "lapse_old", orderId: "ord_a", tier: "minor", detectedAt: "2026-09-01T00:00:00.000Z", status: "warning_only" },
        { id: "lapse_new", orderId: "ord_b", tier: "moderate", detectedAt: "2026-10-01T00:00:00.000Z", status: "warned",
          rateBps: 1500, warnings: [{ tier: "minor", at: "x", message: "raw text", formal: false }, { tier: "moderate", at: "y", formal: true }] },
        { id: "", orderId: "ord_c", tier: "minor" },
        { id: "lapse_bad_tier", orderId: "ord_d", tier: "extreme" },
      ],
    });
    expect(lapses?.map((row) => row.id)).toEqual(["lapse_new", "lapse_old"]);
    expect(lapses?.[0].warnings).toEqual([
      { tier: "minor", at: "x", formal: false },
      { tier: "moderate", at: "y", formal: true },
    ]);
    // The platform's message is never carried into this app's shape.
    expect(JSON.stringify(lapses)).not.toContain("raw text");
  });

  it("is null for a response that is not the contract", () => {
    expect(normalizeLapses(null)).toBeNull();
    expect(normalizeLapses({ lapses: "nope" })).toBeNull();
  });

  it("reads a status-less record from its own dates, and severe as reassignable", () => {
    const [row] = normalizeLapses({
      lapses: [{ id: "l", orderId: "o", tier: "severe", appliedAt: "2026-10-02T00:00:00.000Z", deductionMinor: 900 }],
    }) ?? [];
    expect(row.status).toBe("applied");
    expect(row.reassignmentEligible).toBe(true);
  });

  it("finds the record for one job", () => {
    const rows = [lapse({ orderId: "ord_1" }), lapse({ id: "l2", orderId: "ord_2" })];
    expect(lapseForOrder(rows, "ord_2")?.id).toBe("l2");
    expect(lapseForOrder(rows, "ord_9")).toBeNull();
    expect(lapseForOrder(null, "ord_1")).toBeNull();
  });
});

describe("rates and durations", () => {
  it("speaks percent, not basis points", () => {
    expect(formatRate(500)).toBe("5%");
    expect(formatRate(1250)).toBe("12.5%");
    expect(formatRate(3000)).toBe("30%");
  });

  it("reads the current policy from settings, or nothing from an older API", () => {
    expect(penaltyRates({ productionPenalty: { deductionsEnabled: false, minorBps: 500, moderateBps: 1500, severeBps: 3000 } }))
      .toEqual({ deductionsEnabled: false, rates: { minor: 500, moderate: 1500, severe: 3000 } });
    expect(penaltyRates({})).toBeNull();
    expect(penaltyRates(null)).toBeNull();
  });

  it("says how late in hours and minutes, or days and hours", () => {
    expect(formatLateness(45 * 60_000)).toBe("45 minutes");
    expect(formatLateness(3 * HOUR + 20 * 60_000)).toBe("3 hours 20 minutes");
    expect(formatLateness(1 * HOUR)).toBe("1 hour");
    expect(formatLateness(50 * HOUR)).toBe("2 days 2 hours");
  });
});

describe("lapseNotice: the warning states", () => {
  const unfinished = { readyBy: DEADLINE, readyAt: null };

  it("minor, deductions off: a warning only, with the tier's share and how it can rise", () => {
    const notice = lapseNotice(lapse(), unfinished, at(3));
    expect(notice.chipLabel).toBe("Minor lateness");
    expect(notice.tone).toBe("warning");
    expect(notice.title).toBe("This job is past its ready-by time");
    expect(notice.measured).toMatch(/^Now 3 hours past the ready-by time on this job, /);
    expect(notice.penalty).toMatch(/^This is a warning only — nothing comes off your payout/);
    expect(notice.penalty).toContain("5% of what GRIDGO still owes you on this job");
    expect(notice.deduction).toBeNull();
    expect(notice.consequences).not.toContain("A formal warning is on your shop's record.");
    expect(notice.consequences).toContain("Past 6 hours late it becomes moderate, with a larger share.");
    expect(notice.next).toMatch(/^Finish the job and mark it ready/);
  });

  it("moderate, deductions on: the share comes off once worked out, with a formal warning", () => {
    const notice = lapseNotice(lapse({ tier: "moderate", rateBps: 1500, status: "warned" }), unfinished, at(10));
    expect(notice.chipLabel).toBe("Moderate lateness");
    expect(notice.penalty).toBe(
      "15% of what GRIDGO still owes you on this job comes off once GRIDGO works it out, after the job is ready. Never more than what is still owed, and nothing carries over to another job.",
    );
    expect(notice.consequences[0]).toBe("A formal warning is on your shop's record.");
    expect(notice.consequences).toContain("Past 24 hours late it becomes severe, with a larger share.");
  });

  it("severe: error tone, reassignment named, nothing about rising further", () => {
    const notice = lapseNotice(
      lapse({ tier: "severe", rateBps: 3000, status: "warned", reassignmentEligible: true }),
      unfinished,
      at(30),
    );
    expect(notice.tone).toBe("error");
    expect(notice.penalty).toMatch(/^30% of what GRIDGO .* comes off once GRIDGO works it out\. /);
    expect(notice.consequences).toContain("Operations may now hand this job to another shop.");
    expect(notice.consequences.join(" ")).not.toMatch(/becomes/);
    expect(notice.measured).toMatch(/^Now 1 day 6 hours past/);
  });

  it("a finished job is measured to the moment it was marked ready", () => {
    const notice = lapseNotice(lapse(), { readyBy: DEADLINE, readyAt: at(2).toISOString() }, at(40));
    expect(notice.title).toBe("This job was ready late");
    expect(notice.measured).toMatch(/^Ready 2 hours after the ready-by time on this job/);
    expect(notice.next).toMatch(/^If something outside your shop caused the delay/);
    expect(notice.consequences.join(" ")).not.toMatch(/becomes|hand this job/);
  });

  it("says when the renewed ready-by time is the one measured against", () => {
    const notice = lapseNotice(lapse({ deadlineAt: "2026-10-03T02:00:00.000Z" }), unfinished, new Date("2026-10-03T04:00:00.000Z"));
    expect(notice.measured).toMatch(/the renewed ready-by time you agreed with the client/);
  });

  it("a closed record says no deduction and asks nothing more", () => {
    const notice = lapseNotice(lapse({ tier: "moderate", status: "closed", closedAt: "2026-10-02T00:00:00.000Z" }), unfinished, at(10));
    expect(notice.title).toBe("This job was late");
    expect(notice.penalty).toMatch(/closed without a deduction/);
    expect(notice.consequences).toEqual([]);
    expect(notice.next).toBe("Nothing more is needed from your shop on this.");
  });

  it("never blames: no fault words in any state", () => {
    const states: Partial<ProductionLapse>[] = [
      {}, { status: "warned" }, { tier: "severe", status: "warned" },
      { status: "applied", deductionMinor: 100, remainingBalanceMinor: 1000 }, { status: "closed" },
    ];
    for (const partial of states) {
      const notice = lapseNotice(lapse(partial), unfinished, at(5));
      const words = [notice.title, notice.measured, notice.penalty, ...notice.consequences, notice.next].join(" ");
      expect(words).not.toMatch(/\b(fault|failed|failure|blame|violation|punish)/i);
    }
  });
});

describe("the deduction, against what is still owed", () => {
  it("sets the deduction against the remaining balance", () => {
    const notice = lapseNotice(
      lapse({ tier: "moderate", rateBps: 1500, status: "applied", remainingBalanceMinor: 60_000, deductionMinor: 9_000, appliedAt: "x" }),
      { readyBy: DEADLINE, readyAt: at(8).toISOString() },
    );
    expect(notice.deduction).toEqual({ owedBeforeMinor: 60_000, deductionMinor: 9_000, owedAfterMinor: 51_000, rate: "15%" });
    expect(notice.penalty).toBe(
      "₱90.00 came off what GRIDGO still owed you on this job. Money already sent to you was not touched, and nothing carries over to another job.",
    );
  });

  it("never shows more coming off than was still owed", () => {
    const record = lapse({ status: "applied", remainingBalanceMinor: 5_000, deductionMinor: 8_000 });
    expect(cappedDeductionMinor(record)).toBe(5_000);
    const notice = lapseNotice(record, { readyBy: DEADLINE, readyAt: at(1).toISOString() });
    expect(notice.deduction?.deductionMinor).toBe(5_000);
    expect(notice.deduction?.owedAfterMinor).toBe(0);
    expect(lapseStandingLine(record)).toBe("₱50.00 off ₱50.00 still owed");
  });

  it("names each record's standing in one line", () => {
    expect(lapseStandingLine(lapse())).toBe("Warning only, no deduction");
    expect(lapseStandingLine(lapse({ status: "warned", rateBps: 1500 }))).toBe("15% to come off, once worked out");
    expect(lapseStandingLine(lapse({ status: "closed" }))).toBe("Closed, no deduction");
  });
});

describe("late-production alerts", () => {
  const warning = {
    type: "production_lapse_warning",
    title: "Late production warning",
    body: "This order missed its ready-by deadline of 2026-10-01T00:00:00.000Z. This is moderate lateness. The penalty is 15% of what GRIDGO still owes your shop on this order, capped at that balance. Deductions are off for this lapse; this is a warning only.",
  };

  it("rewrites the warning without the raw timestamp", () => {
    expect(presentLapseAlert(warning)).toEqual({
      title: "Late production: moderate",
      body: "This job is past its ready-by time. This is a warning only — nothing comes off your payout. Open it to see how it was measured and what applies.",
    });
    expect(presentAlertBody(warning)).not.toMatch(/T00:00/);
    expect(presentAlertTitle(warning)).toBe("Late production: moderate");
  });

  it("keeps the amount of a deduction", () => {
    expect(
      presentLapseAlert({
        type: "production_lapse_deduction",
        body: "A late-production deduction of ₱90.00 was applied to this order's unpaid shop payout. Nothing carries over to another order.",
      }),
    ).toEqual({
      title: "Late production deduction",
      body: "₱90.00 came off what GRIDGO still owes you on this job. Nothing carries over to another job.",
    });
  });

  it("leaves every other alert alone", () => {
    expect(presentLapseAlert({ type: "shop_job_assigned", body: "x" })).toBeNull();
  });
});
