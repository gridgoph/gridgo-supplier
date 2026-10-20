import {
  normalizePreview,
  previewDayDetail,
  previewDayLabel,
  previewQuery,
  previewReasonLine,
  previewSummary,
} from "@/lib/productionTimePreview";

/** GRIDGO's preview answer, shaped as `docs/SCHEDULING_API.md` publishes it. */
const answer = {
  productionTime: { mode: "days", minDays: 1, maxDays: 3 },
  scheduling: {
    status: "tight",
    earliestReadyBy: "2026-10-24T05:00:00.000Z",
    securedReadyBy: "2026-10-27T05:00:00.000Z",
  },
  calendar: {
    days: [
      { day: "2026-10-20", state: "cannot", status: "not_possible", reason: "after_dispatch_cutoff", readyBy: null },
      { day: "2026-10-24", state: "tight", status: "tight", reason: null, readyBy: "2026-10-24T05:00:00.000Z" },
      { day: "2026-10-25", state: "cannot", status: "not_possible", reason: "gridgo_closed_sunday", readyBy: null },
      {
        day: "2026-10-26",
        state: "tight",
        status: "rush",
        reason: null,
        readyBy: "2026-10-26T02:00:00.000Z",
        rushTier: { id: "tier_1", label: "Rush", priceMinor: 50000, surchargeMinor: null, clientPriceMinor: 57500 },
      },
      { day: "2026-10-27", state: "open", status: "secured", reason: null, readyBy: "2026-10-26T05:00:00.000Z" },
    ],
    earliest: "2026-10-24T05:00:00.000Z",
    operatingStatus: { timeZone: "Asia/Manila" },
    expressAvailable: false,
  },
};

describe("the preview of dates clients will see", () => {
  it("asks for the proposed answer in GRIDGO's query words", () => {
    expect(previewQuery({ mode: "same_day", minutes: 90 })).toEqual({ mode: "same_day", hours: "1.5", days: "14" });
    expect(previewQuery({ mode: "days", minDays: 1, maxDays: 3 })).toEqual({
      mode: "days",
      minDays: "1",
      maxDays: "3",
      days: "14",
    });
  });

  it("reads each day's status, and an older API's state where status is missing", () => {
    const preview = normalizePreview(answer);
    expect(preview?.days.map((day) => day.status)).toEqual(["not_possible", "tight", "not_possible", "rush", "secured"]);
    expect(preview?.earliestReadyBy?.toISOString()).toBe("2026-10-24T05:00:00.000Z");
    expect(
      normalizePreview({ calendar: { days: [{ day: "2026-10-24", state: "open" }, { day: "2026-10-25", state: "x" }] } })
        ?.days.map((day) => day.status),
    ).toEqual(["secured", "not_possible"]);
  });

  it("reads nothing from an answer without a calendar", () => {
    expect(normalizePreview(null)).toBeNull();
    expect(normalizePreview({ scheduling: {} })).toBeNull();
  });

  it("says the soonest ready time and, for Days, when dates are Secured, as the dashboard does", () => {
    const preview = normalizePreview(answer);
    expect(preview && previewSummary({ mode: "days", minDays: 1, maxDays: 3 }, preview)).toBe(
      "If a client orders now, the soonest it can be ready is Sat 24 Oct, 1:00 PM. Dates from Tue 27 Oct, 1:00 PM are Secured.",
    );
    expect(preview && previewSummary({ mode: "same_day", minutes: 120 }, preview)).toBe(
      "If a client orders now, the soonest it can be ready is Sat 24 Oct, 1:00 PM.",
    );
    expect(previewSummary({ mode: "same_day", minutes: 120 }, { earliestReadyBy: null, securedReadyBy: null, days: [] })).toBe(
      "No date in the next two weeks can be offered yet.",
    );
  });

  it("says each day's ready time, and a Rush day's faster tier at the shop's own price", () => {
    const days = normalizePreview(answer)?.days ?? [];
    expect(days.map(previewDayDetail)).toEqual([
      "After the dispatch cutoff",
      "Ready by Sat 24 Oct, 1:00 PM",
      "GRIDGO is closed on Sundays",
      // Never the client price, which carries GRIDGO's markup.
      "Your Rush option at ₱500.00. Ready by Mon 26 Oct, 10:00 AM",
      "Ready by Mon 26 Oct, 1:00 PM",
    ]);
  });

  it("names a day on its own calendar and says why it is not offered", () => {
    expect(previewDayLabel("2026-10-25")).toBe("Sun 25 Oct");
    expect(previewReasonLine("gridgo_closed_sunday")).toBe("GRIDGO is closed on Sundays");
    expect(previewReasonLine("before_shortest_time")).toBe("Sooner than your shortest time");
    expect(previewReasonLine("something_new")).toBe("Not offered");
  });
});
