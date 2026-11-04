import {
  dispatchClosedLine,
  openingLabel,
  readDispatchHours,
  waitsForDispatch,
} from "@/lib/dispatchHours";
import { custodyForOrder } from "@/lib/handoff";

// Every instant is given in UTC, so these hold whatever zone the suite runs in.
// CI runs them in UTC; run with TZ=America/New_York or TZ=Pacific/Auckland to see the same result.
const closed = (nextOpenAt: string) => ({ isOpenNow: false, nextOpenAt });
/** 8:00 AM Manila on Thursday 5 Nov 2026. */
const THU_8AM = "2026-11-05T00:00:00.000Z";

describe("openingLabel, in Manila time", () => {
  it("says today before the morning opening", () => {
    // 6:30 AM Thursday in Manila; still Wednesday evening in UTC and the Americas.
    expect(openingLabel(new Date(THU_8AM), new Date("2026-11-04T22:30:00.000Z"))).toBe("8:00 AM today");
  });

  it("says today just after Manila midnight, when the device's own date may still be yesterday", () => {
    expect(openingLabel(new Date(THU_8AM), new Date("2026-11-04T16:00:00.000Z"))).toBe("8:00 AM today");
  });

  it("says tomorrow after closing", () => {
    // 5:28 PM Wednesday in Manila.
    expect(openingLabel(new Date(THU_8AM), new Date("2026-11-04T09:28:00.000Z"))).toBe("8:00 AM tomorrow");
  });

  it("still says tomorrow at 11:59 PM, one minute before the day turns", () => {
    expect(openingLabel(new Date(THU_8AM), new Date("2026-11-04T15:59:00.000Z"))).toBe("8:00 AM tomorrow");
  });

  it("names the weekday across a closed Sunday", () => {
    // 5:30 PM Saturday 7 Nov in Manila, opening 8:00 AM Monday 9 Nov.
    expect(openingLabel(new Date("2026-11-09T00:00:00.000Z"), new Date("2026-11-07T09:30:00.000Z"))).toBe(
      "8:00 AM on Monday",
    );
  });

  it("uses the real opening time, not a fixed 8:00 AM", () => {
    // 9:30 AM Manila.
    expect(openingLabel(new Date("2026-11-05T01:30:00.000Z"), new Date("2026-11-04T10:00:00.000Z"))).toBe(
      "9:30 AM tomorrow",
    );
  });

  it("gives the date once a closure runs a week or longer", () => {
    expect(openingLabel(new Date("2026-12-28T00:00:00.000Z"), new Date("2026-12-21T09:30:00.000Z"))).toBe(
      "8:00 AM on Mon, Dec 28",
    );
  });
});

describe("dispatchClosedLine", () => {
  const now = new Date("2026-11-04T09:28:00.000Z");

  it("says when riders can pick the job up", () => {
    expect(dispatchClosedLine(closed(THU_8AM), now)).toBe("Riders can pick this up from 8:00 AM tomorrow.");
  });

  it("says nothing while dispatch is open", () => {
    expect(dispatchClosedLine({ isOpenNow: true, nextOpenAt: now.toISOString() }, now)).toBeNull();
  });

  it("says nothing without a status or a usable opening", () => {
    expect(dispatchClosedLine(null, now)).toBeNull();
    expect(dispatchClosedLine({ isOpenNow: false, nextOpenAt: null }, now)).toBeNull();
  });

  it("says nothing once the opening has passed, however old the read", () => {
    expect(dispatchClosedLine(closed(THU_8AM), new Date(THU_8AM))).toBeNull();
  });
});

describe("readDispatchHours", () => {
  it("reads GET /settings' operatingStatus", () => {
    expect(readDispatchHours({ timeZone: "Asia/Manila", isOpenNow: false, scheduledReviewAt: THU_8AM })).toEqual({
      isOpenNow: false,
      nextOpenAt: THU_8AM,
    });
  });

  it("drops an older or malformed payload", () => {
    expect(readDispatchHours(null)).toBeNull();
    expect(readDispatchHours({})).toBeNull();
    expect(readDispatchHours({ isOpenNow: "no" })).toBeNull();
    expect(readDispatchHours({ isOpenNow: false, scheduledReviewAt: "soon" })).toEqual({
      isOpenNow: false,
      nextOpenAt: null,
    });
  });
});

describe("waitsForDispatch", () => {
  const order = { id: "o", state: "ready_for_dispatch", riderId: null } as never;

  it("is a ready job with no rider", () => {
    expect(waitsForDispatch(order)).toBe(true);
  });

  it("is not a job with a rider, or one not ready yet", () => {
    expect(waitsForDispatch({ ...(order as object), riderId: "r" } as never)).toBe(false);
    expect(waitsForDispatch({ ...(order as object), state: "supplier_self_qc" } as never)).toBe(false);
  });

  it("is not a job a refund has stopped, or one the shop let go", () => {
    expect(waitsForDispatch({ ...(order as object), refundHold: true } as never)).toBe(false);
    expect(waitsForDispatch({ ...(order as object), shopRecovery: { status: "offered" } } as never)).toBe(false);
  });
});

describe("custody while dispatch is closed", () => {
  const ready = { state: "ready_for_dispatch", riderId: null, pickupChecklist: null } as never;
  const riderPacks = { ...(ready as object), handoverFlow: "rider_packs" } as never;

  it("no longer says riders were told", () => {
    expect(custodyForOrder(ready, { dispatchClosed: true }).detail).not.toContain("notified");
    expect(custodyForOrder(riderPacks, { dispatchClosed: true }).detail).not.toContain("notified");
  });

  it("keeps what to do with the products", () => {
    expect(custodyForOrder(ready, { dispatchClosed: true }).detail).toContain("Keep the package at the counter");
    expect(custodyForOrder(riderPacks, { dispatchClosed: true }).now?.instruction).toContain("Do not pack yet");
  });

  it("is unchanged while dispatch is open", () => {
    expect(custodyForOrder(ready).detail).toContain("Riders have been notified");
    expect(custodyForOrder(riderPacks).detail).toContain("Riders have been notified");
  });
});
