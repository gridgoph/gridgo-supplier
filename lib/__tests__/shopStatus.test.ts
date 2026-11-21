import {
  changeSentence,
  nightChipLabel,
  normalizeShopStatus,
  pauseLine,
  signOf,
  statusPillLabel,
  todayRange,
  type ShopStatusRecord,
} from "@/lib/shopStatus";

/** 2026-11-22 14:00 in Manila. */
const NOW = new Date("2026-11-22T06:00:00.000Z");

function raw(overrides: Record<string, unknown> = {}) {
  return {
    supplierId: "s1",
    shopName: "Test shop",
    version: 4,
    hours: {
      version: 4,
      schedule: { week: [{ weekday: 0, opensMinute: 480, closesMinute: 1080 }], closures: [] },
      temporarilyClosed: false,
      isOpenNow: true,
      nextOpeningAt: null,
      calendarAvailable: true,
    },
    todayHours: [{ opensMinute: 480, closesMinute: 1080 }],
    isOpenNow: true,
    nextOpeningAt: NOW.toISOString(),
    expressEnabled: true,
    nightJobs: "until_23",
    nightWindow: null,
    printerDemandPings: false,
    pausedUntil: null,
    ...overrides,
  };
}

function status(overrides: Record<string, unknown> = {}): ShopStatusRecord {
  const read = normalizeShopStatus(raw(overrides));
  if (!read) throw new Error("fixture did not read");
  return read;
}

describe("reading GRIDGO's shop status", () => {
  it("reads every field the sign, chips and sheet use", () => {
    const read = status();
    expect(read.version).toBe(4);
    expect(read.todayHours).toEqual([{ opensMinute: 480, closesMinute: 1080 }]);
    expect(read.expressEnabled).toBe(true);
    expect(read.nightJobs).toBe("until_23");
    expect(read.temporarilyClosed).toBe(false);
    expect(read.hours?.week).toHaveLength(1);
  });

  it("treats an unknown night mode as off and refuses a body with no version", () => {
    expect(status({ nightJobs: "until_25" }).nightJobs).toBe("off");
    expect(normalizeShopStatus({ isOpenNow: true })).toBeNull();
  });
});

describe("the open/closed sign", () => {
  it("says OPEN with today's hours, and tapping closes", () => {
    const sign = signOf(status(), NOW);
    expect(sign).toMatchObject({ open: true, word: "OPEN", line: "8 AM – 6 PM", action: "close" });
  });

  it("says the night window when GRIDGO reports one running", () => {
    const sign = signOf(
      status({
        nightWindow: { night: "2026-11-22", startsAt: "2026-11-22T10:00:00Z", endsAt: "2026-11-22T15:00:00Z" },
      }),
      NOW,
    );
    expect(sign.line).toBe("Night jobs until 11 PM");
  });

  it("says CLOSED with the next opening outside hours, and tapping goes to hours", () => {
    const sign = signOf(status({ isOpenNow: false, nextOpeningAt: "2026-11-23T00:00:00Z" }), NOW);
    expect(sign).toMatchObject({ open: false, word: "CLOSED", line: "Opens tomorrow at 8 AM", action: "hours" });
  });

  it("says a manual closure, and tapping opens", () => {
    const closed = status({ isOpenNow: false, hours: { ...raw().hours, temporarilyClosed: true } });
    expect(signOf(closed, NOW)).toMatchObject({ word: "CLOSED", line: "Closed until you open it", action: "open" });
  });

  it("puts a pause above everything else, and tapping resumes", () => {
    const paused = status({ isOpenNow: false, pausedUntil: "2026-11-22T07:00:00Z" });
    expect(signOf(paused, NOW)).toMatchObject({ word: "CLOSED", line: "Paused until 3 PM", action: "resume" });
  });

  it("ignores a pause that has already run out", () => {
    expect(signOf(status({ pausedUntil: "2026-11-22T05:00:00Z" }), NOW).word).toBe("OPEN");
  });
});

describe("words around the status", () => {
  it("says a pause to midnight as the rest of today", () => {
    expect(pauseLine("2026-11-22T16:00:00Z", NOW)).toBe("Paused for the rest of today");
  });

  it("names the night chip, and draws none while night jobs are off", () => {
    expect(nightChipLabel("until_21")).toBe("Night until 9 PM");
    expect(nightChipLabel("all_night")).toBe("Night: all night");
    expect(nightChipLabel("off")).toBeNull();
  });

  it("joins today's windows into one range", () => {
    expect(todayRange([])).toBeNull();
    expect(todayRange([{ opensMinute: 510, closesMinute: 1050 }])).toBe("8:30 AM – 5:30 PM");
  });

  it("keeps the To do pill to a few words, with Paused and Closed winning", () => {
    expect(statusPillLabel(status(), NOW)).toBe("Express on · night until 11 pm");
    expect(statusPillLabel(status({ expressEnabled: false, nightJobs: "off" }), NOW)).toBe("Express off");
    expect(statusPillLabel(status({ pausedUntil: "2026-11-22T07:00:00Z" }), NOW)).toBe("Paused");
  });

  it("says what changed after every kind of change", () => {
    expect(changeSentence({ expressEnabled: false })).toMatch(/Express is off/);
    expect(changeSentence({ nightJobs: "until_21" })).toMatch(/until 9 PM/);
    expect(changeSentence({ pause: "one_hour" })).toMatch(/Paused for 1 hour/);
    expect(changeSentence({ pause: null })).toMatch(/taking jobs again/);
    expect(changeSentence({ temporarilyClosed: true })).toMatch(/closed/);
  });
});

describe("the night printer ping", () => {
  it("opens To do, where the next Express offer lands", () => {
    const { pushTargetRoute } = jest.requireActual("@/lib/push") as typeof import("@/lib/push");
    expect(pushTargetRoute({ notificationId: "ntf_1", type: "printer_demand", orderId: null, at: "2026-11-22T13:00:00Z" })).toBe(
      "/(tabs)/home",
    );
  });
});
