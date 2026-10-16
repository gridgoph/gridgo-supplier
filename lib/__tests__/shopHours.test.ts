import {
  closedDayCount,
  extensionPastGridgoHours,
  extensionState,
  manilaClock,
  normalizeShopHours,
  openDaysLabel,
  operatingWeekOf,
  schedulePatch,
  shopHoursSummary,
  shopStatus,
  timeLabel,
  validateClosure,
  validateWeekDraft,
  weekDraftChanged,
  weekDraftOf,
  weekFromDraft,
  type ShopHours,
  type WeekWindow,
} from "@/lib/shopHours";

/** A Manila wall-clock time. 16 Oct 2026 is a Friday (weekday 5). */
const at = (local: string) => new Date(`${local}:00+08:00`);

const MON_SAT: WeekWindow[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensMinute: 480, closesMinute: 1080 }));

/** What `GET /me/shop-hours` answered on the local API for a seeded shop. */
const DEV_ANSWER = {
  hours: {
    timeZone: "Asia/Manila",
    schedule: { utcOffsetMinutes: 480, week: MON_SAT, closures: [] },
    version: 1,
    temporarilyClosed: false,
    isOpenNow: false,
    nextOpeningAt: "2026-10-16T00:00:00.000Z",
    todayExtension: null,
    calendarAvailable: true,
    dispatchNotice: null,
    features: { multipleWindows: false, overnightWindows: false, riderShifts: false, hubDays: false },
  },
};

function hours(patch: Partial<ShopHours> = {}): ShopHours {
  return { ...(normalizeShopHours(DEV_ANSWER) as ShopHours), ...patch };
}

describe("normalizeShopHours", () => {
  it("reads GRIDGO's answer", () => {
    expect(hours()).toEqual({
      version: 1,
      week: MON_SAT,
      closures: [],
      temporarilyClosed: false,
      isOpenNow: false,
      calendarAvailable: true,
      nextOpeningAt: "2026-10-16T00:00:00.000Z",
      todayExtension: null,
      dispatchWaits: false,
    });
  });

  it("drops rows it cannot read and sorts closures", () => {
    const read = normalizeShopHours({
      hours: {
        ...DEV_ANSWER.hours,
        schedule: {
          week: [{ weekday: 9, opensMinute: 0, closesMinute: 60 }, { weekday: 1, opensMinute: 600, closesMinute: 500 }, MON_SAT[0]],
          closures: [
            { startDay: "2026-12-30", endDay: "2026-12-31" },
            { startDay: "2026-12-24", endDay: "2026-12-26" },
            { startDay: "2026-12-28", endDay: "2026-12-27" },
            "Christmas",
          ],
        },
        dispatchNotice: "review_and_dispatch_in_next_working_window",
      },
    });
    expect(read?.week).toEqual([MON_SAT[0]]);
    expect(read?.closures).toEqual([
      { startDay: "2026-12-24", endDay: "2026-12-26" },
      { startDay: "2026-12-30", endDay: "2026-12-31" },
    ]);
    expect(read?.dispatchWaits).toBe(true);
  });

  it("is null for something that is not shop hours", () => {
    expect(normalizeShopHours(null)).toBeNull();
    expect(normalizeShopHours({ profile: {} })).toBeNull();
  });
});

describe("the Manila clock", () => {
  it("reads today and now at UTC+08:00, whatever the phone's zone", () => {
    expect(manilaClock(new Date("2026-10-15T16:37:30Z"))).toEqual({ dayKey: "2026-10-16", weekday: 5, minute: 37.5 });
  });

  it("says times the way a shop does", () => {
    expect([0, 480, 720, 1080, 1439].map(timeLabel)).toEqual(["12:00 AM", "8:00 AM", "12:00 PM", "6:00 PM", "11:59 PM"]);
  });
});

describe("weekly hours", () => {
  it("starts from the open days at their shared hours", () => {
    expect(weekDraftOf(MON_SAT)).toEqual({ draft: { days: [1, 2, 3, 4, 5, 6], opensMinute: 480, closesMinute: 1080 }, uneven: false });
  });

  it("notices hours that differ from day to day, and keeps the hours most days have", () => {
    const week = [...MON_SAT.slice(0, 5), { weekday: 6, opensMinute: 480, closesMinute: 720 }];
    expect(weekDraftOf(week)).toEqual({ draft: { days: [1, 2, 3, 4, 5, 6], opensMinute: 480, closesMinute: 1080 }, uneven: true });
    // Uneven hours always count as a change, so the screen offers to even them.
    expect(weekDraftChanged(week, weekDraftOf(week).draft)).toBe(true);
  });

  it("sends one window per open day", () => {
    const draft = { days: [5, 1, 3], opensMinute: 540, closesMinute: 1020 };
    expect(weekFromDraft(draft)).toEqual([
      { weekday: 1, opensMinute: 540, closesMinute: 1020 },
      { weekday: 3, opensMinute: 540, closesMinute: 1020 },
      { weekday: 5, opensMinute: 540, closesMinute: 1020 },
    ]);
    expect(weekDraftChanged(MON_SAT, draft)).toBe(true);
    expect(weekDraftChanged(MON_SAT, weekDraftOf(MON_SAT).draft)).toBe(false);
  });

  it("names what is missing", () => {
    expect(validateWeekDraft({ days: [], opensMinute: 480, closesMinute: 1080 })).toMatch(/at least one day/);
    expect(validateWeekDraft({ days: [1], opensMinute: 1080, closesMinute: 480 })).toMatch(/closing time later/);
    expect(validateWeekDraft({ days: [1], opensMinute: 480, closesMinute: 1080 })).toBeNull();
  });

  it("says the open days in a shop's words", () => {
    expect(openDaysLabel([1, 2, 3, 4, 5, 6])).toBe("Mon–Sat");
    expect(openDaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(openDaysLabel([1, 3, 5])).toBe("Mon, Wed, Fri");
    expect(openDaysLabel([0, 1, 2, 6])).toBe("Mon, Tue, Sat, Sun");
  });
});

describe("closure dates", () => {
  const christmas = { startDay: "2026-12-24", endDay: "2026-12-26" };

  it("refuses an overlap, a backwards range and more than 90 dates", () => {
    expect(validateClosure({ startDay: "2026-12-26", endDay: "2026-12-27" }, [christmas])).toMatch(/overlaps/);
    expect(validateClosure({ startDay: "2026-12-27", endDay: "2026-12-26" }, [])).toMatch(/before the first/);
    expect(validateClosure({ startDay: "2027-01-01", endDay: "2027-03-31" }, [christmas])).toMatch(/90 dates/);
    expect(validateClosure({ startDay: "2027-01-01", endDay: "2027-01-01" }, [christmas])).toBeNull();
  });

  it("lets a closure be changed without clashing with itself", () => {
    expect(validateClosure({ startDay: "2026-12-23", endDay: "2026-12-26" }, [christmas], christmas)).toBeNull();
  });

  it("counts distinct dates the way GRIDGO does", () => {
    expect(closedDayCount([christmas, { startDay: "2026-12-31", endDay: "2027-01-01" }])).toBe(5);
  });
});

describe("open now", () => {
  it("is open until the extension's close", () => {
    const now = at("2026-10-16T17:00");
    const status = shopStatus(
      hours({ isOpenNow: true, todayExtension: { day: "2026-10-16", opensMinute: 1080, closesMinute: 1200 } }),
      now,
    );
    expect(status).toMatchObject({ state: "open", title: "Open now", detail: "Until 8:00 PM today, with your extension." });
  });

  it("says when a closed shop opens next", () => {
    expect(shopStatus(hours(), at("2026-10-16T00:40")).detail).toBe("Opens today at 8:00 AM.");
    expect(shopStatus(hours({ nextOpeningAt: "2026-10-17T00:00:00.000Z" }), at("2026-10-16T19:00")).detail).toBe(
      "Opens tomorrow at 8:00 AM.",
    );
  });

  it("says when today is a closure date", () => {
    const closed = hours({ closures: [{ startDay: "2026-10-16", endDay: "2026-10-16" }], nextOpeningAt: "2026-10-17T00:00:00.000Z" });
    expect(shopStatus(closed, at("2026-10-16T10:00")).detail).toBe("Today is a closure date. Opens tomorrow at 8:00 AM.");
  });

  it("puts a temporary closure above everything else", () => {
    const status = shopStatus(hours({ temporarilyClosed: true, isOpenNow: false, nextOpeningAt: null }), at("2026-10-16T10:00"));
    expect(status.state).toBe("temporarily_closed");
    expect(shopHoursSummary(hours({ temporarilyClosed: true }), at("2026-10-16T10:00"))).toBe("Temporarily closed");
  });

  it("asks for hours when GRIDGO cannot read the saved ones", () => {
    expect(shopStatus(hours({ calendarAvailable: false }), at("2026-10-16T10:00")).state).toBe("unreadable");
  });

  it("sums the week up for the Account row", () => {
    expect(shopHoursSummary(hours({ isOpenNow: true }), at("2026-10-16T10:00"))).toBe("Open now · Mon–Sat, 8:00 AM–6:00 PM");
  });
});

describe("staying open later today", () => {
  it("offers times later than the usual close, before midnight and at least 30 minutes away", () => {
    const state = extensionState(hours(), at("2026-10-16T10:00"));
    expect(state.kind).toBe("available");
    if (state.kind !== "available") return;
    expect(state.normalClose).toBe(1080);
    expect(state.choices[0]).toBe(1110);
    expect(state.choices[state.choices.length - 1]).toBe(1439);
  });

  it("accepts exactly 30 minutes ahead, as GRIDGO does", () => {
    const state = extensionState(hours(), at("2026-10-16T19:30"));
    expect(state.kind === "available" && state.choices[0]).toBe(1200);
  });

  it("says why it cannot", () => {
    const reason = (h: ShopHours, local: string) => {
      const state = extensionState(h, at(local));
      return state.kind === "unavailable" ? state.reason : null;
    };
    expect(reason(hours({ temporarilyClosed: true }), "2026-10-16T10:00")).toMatch(/Reopen your shop first/);
    expect(reason(hours(), "2026-10-18T10:00")).toMatch(/not one of your open days/);
    expect(reason(hours({ closures: [{ startDay: "2026-10-16", endDay: "2026-10-16" }] }), "2026-10-16T10:00")).toMatch(
      /closure dates/,
    );
    expect(reason(hours(), "2026-10-16T23:40")).toMatch(/too late/);
  });

  it("warns when the extension runs past GRIDGO's own hours", () => {
    const gridgo = operatingWeekOf({
      operatingHours: { schedule: { week: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensMinute: 480, closesMinute: 1020 })) } },
    });
    expect(extensionPastGridgoHours(1200, gridgo, at("2026-10-16T10:00"))).toBe(true);
    expect(extensionPastGridgoHours(1000, gridgo, at("2026-10-16T10:00"))).toBe(false);
    expect(extensionPastGridgoHours(1000, gridgo, at("2026-10-18T10:00"))).toBe(true);
    expect(extensionPastGridgoHours(1200, null, at("2026-10-16T10:00"))).toBeNull();
  });
});

describe("saving the week or the closure dates", () => {
  const extended = hours({ todayExtension: { day: "2026-10-16", opensMinute: 1080, closesMinute: 1200 } });

  it("sends today's extension again so GRIDGO keeps it", () => {
    const { patch, dropsExtension } = schedulePatch(
      extended,
      { closures: [{ startDay: "2026-12-24", endDay: "2026-12-26" }] },
      at("2026-10-16T10:00"),
    );
    expect(dropsExtension).toBe(false);
    expect(patch).toEqual({
      schedule: { utcOffsetMinutes: 480, week: MON_SAT, closures: [{ startDay: "2026-12-24", endDay: "2026-12-26" }] },
      extension: { closesMinute: 1200 },
    });
  });

  it("says when it cannot be kept", () => {
    const later = MON_SAT.map((row) => ({ ...row, closesMinute: 1260 }));
    expect(schedulePatch(extended, { week: later }, at("2026-10-16T10:00")).dropsExtension).toBe(true);
    expect(schedulePatch(extended, {}, at("2026-10-16T19:45")).dropsExtension).toBe(true);
    expect(schedulePatch(hours(), { week: later }, at("2026-10-16T10:00")).dropsExtension).toBe(false);
  });
});
