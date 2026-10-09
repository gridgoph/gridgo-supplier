import { parsePushData, pushTargetRoute } from "@/lib/push";
import {
  CALLS_NEED_APP,
  activeCall,
  endCopy,
  endReasonFor,
  formatCallDuration,
  isRingingForMe,
  latestMissedCall,
  parseCall,
  parseCalls,
  phaseLabel,
  pickupCallAvailability,
  pickupCallEntry,
  presentCallAlert,
  spokenDuration,
  type OrderCall,
} from "@/lib/orderCall";
import { presentAlertTitle } from "@/lib/alertStages";

const NOW = Date.parse("2026-10-08T08:00:10.000Z");

function call(overrides: Partial<OrderCall> = {}): OrderCall {
  return {
    id: "e115b493-dee1-448f-b6ba-a9868f448df2",
    orderId: "ord_1",
    pair: "pickup",
    state: "ringing",
    caller: { firstName: "Jun", role: "rider" },
    callee: { firstName: "Shop", role: "supplier" },
    mine: false,
    createdAt: "2026-10-08T08:00:00.000Z",
    ringExpiresAt: "2026-10-08T08:00:30.000Z",
    acceptedAt: null,
    endedAt: null,
    leaseExpiresAt: null,
    ...overrides,
  };
}

const OPEN_CHAT = { status: "open", unread: 0, closesAt: null, riderFirstName: "Jun" };

describe("reading GRIDGO's call projection", () => {
  it("keeps only the allowlisted fields and a first name", () => {
    const parsed = parseCall({
      ...call(),
      caller: { firstName: "Jun Dela Cruz", role: "rider", phone: "0917 000 0000" },
      extra: "never copied",
    });
    expect(parsed?.caller).toEqual({ firstName: "Jun", role: "rider" });
    expect(parsed).not.toHaveProperty("extra");
  });

  it("falls back to the role word when no name is sent", () => {
    expect(parseCall({ ...call(), caller: { role: "rider" } })?.caller.firstName).toBe("Rider");
  });

  it("drops anything that is not a call", () => {
    expect(parseCall(null)).toBeNull();
    expect(parseCall({ ...call(), state: "dialling" })).toBeNull();
    expect(parseCalls([call(), { id: 3 }, "x"])).toHaveLength(1);
    expect(parseCalls(undefined)).toEqual([]);
  });
});

describe("when the job offers a call", () => {
  it("is open from rider acceptance until pick-up", () => {
    expect(pickupCallAvailability({ state: "rider_assigned", pickupChat: OPEN_CHAT })).toEqual({
      kind: "open",
      riderFirstName: "Jun",
    });
  });

  it("closes at pick-up even though the messages stay open", () => {
    expect(pickupCallAvailability({ state: "picked_up", pickupChat: OPEN_CHAT }).kind).toBe("closed");
    expect(pickupCallAvailability({ state: "out_for_delivery", pickupChat: OPEN_CHAT }).kind).toBe("closed");
  });

  it("is closed with no rider conversation, a read-only one, or no job", () => {
    expect(pickupCallAvailability({ state: "rider_assigned" }).kind).toBe("closed");
    expect(pickupCallAvailability({ state: "rider_assigned", pickupChat: { ...OPEN_CHAT, status: "read_only" } }).kind).toBe("closed");
    expect(pickupCallAvailability({ state: "ready_for_pickup", pickupChat: OPEN_CHAT }).kind).toBe("closed");
    expect(pickupCallAvailability(null).kind).toBe("closed");
  });

  it("names the rider, never a number, and says what a build without calling needs", () => {
    expect(pickupCallEntry("Jun", true)).toMatchObject({ title: "Call Jun" });
    expect(pickupCallEntry("Jun", true).detail).toMatch(/your number stays private/);
    expect(pickupCallEntry(null, true).title).toBe("Call the rider");
    expect(pickupCallEntry("Jun", false).detail).toBe(CALLS_NEED_APP);
    expect(CALLS_NEED_APP).toBe("Calls need the latest GRIDGO app from the download page");
  });
});

describe("ringing", () => {
  it("rings only for the rider's live call with time left", () => {
    expect(isRingingForMe(call(), NOW)).toBe(true);
    expect(isRingingForMe(call({ mine: true }), NOW)).toBe(false);
    expect(isRingingForMe(call({ state: "missed" }), NOW)).toBe(false);
    // A stale push: the ring has already run out.
    expect(isRingingForMe(call(), Date.parse("2026-10-08T08:00:31.000Z"))).toBe(false);
  });

  it("finds the one active call on the pickup pair", () => {
    const ended = call({ id: "a", state: "ended" });
    const live = call({ id: "b", state: "accepted" });
    expect(activeCall([ended, live])?.id).toBe("b");
    expect(activeCall([ended])).toBeNull();
    expect(activeCall([call({ pair: "delivery" })])).toBeNull();
  });
});

describe("missed calls on the job", () => {
  it("says who called while the unanswered call is the latest", () => {
    const missed = call({ state: "missed", endedAt: "2026-10-08T08:00:30.000Z" });
    expect(latestMissedCall([missed])).toMatchObject({ title: "Missed call from Jun", firstName: "Jun" });
    expect(latestMissedCall([call({ state: "cancelled" })])?.title).toBe("Missed call from Jun");
    expect(latestMissedCall([call({ state: "declined" })])?.title).toBe("You declined Jun's call");
  });

  it("goes once the shop calls back or the call was answered", () => {
    const missed = call({ id: "a", state: "missed" });
    const callBack = call({ id: "b", mine: true, state: "ended", createdAt: "2026-10-08T08:02:00.000Z" });
    expect(latestMissedCall([missed, callBack])).toBeNull();
    expect(latestMissedCall([call({ state: "ended" })])).toBeNull();
    expect(latestMissedCall([])).toBeNull();
  });
});

describe("what the call screen says", () => {
  it("labels each connection state", () => {
    expect(phaseLabel("calling")).toBe("Calling…");
    expect(phaseLabel("ringing")).toBe("Ringing…");
    expect(phaseLabel("connecting")).toBe("Connecting…");
    expect(phaseLabel("reconnecting")).toBe("Reconnecting…");
  });

  it("gives each end its own reason, from this shop's side", () => {
    expect(endReasonFor({ state: "declined", mine: true })).toBe("declined");
    expect(endReasonFor({ state: "missed", mine: true })).toBe("no_answer");
    expect(endReasonFor({ state: "missed", mine: false })).toBe("missed");
    expect(endReasonFor({ state: "cancelled", mine: false })).toBe("missed");
    expect(endReasonFor({ state: "ended", mine: false })).toBe("ended");
    expect(endCopy("declined", "Jun").title).toBe("Call declined");
    expect(endCopy("no_answer", "Jun").title).toBe("Not answered");
    expect(endCopy("missed", "Jun").title).toBe("Missed call from Jun");
    expect(endCopy("ended", "Jun", "2:31").body).toBe("You talked for 2:31.");
    expect(endCopy("network_lost", "Jun").title).toBe("Call dropped");
    expect(endCopy("not_available", "Jun").canCallAgain).toBe(false);
  });

  it("formats the timer and says it aloud", () => {
    expect(formatCallDuration(7_000)).toBe("0:07");
    expect(formatCallDuration(760_000)).toBe("12:40");
    expect(formatCallDuration(3_729_000)).toBe("1:02:09");
    expect(spokenDuration(61_000)).toBe("1 minute 1 second");
  });
});

describe("call notices", () => {
  it("are said in a shop's words", () => {
    expect(presentCallAlert({ type: "order_call_missed" })?.title).toBe("Missed call from the rider");
    expect(presentAlertTitle({ type: "order_call_missed", title: "Missed voice call", body: "Open the order to call back." })).toBe(
      "Missed call from the rider",
    );
    expect(presentCallAlert({ type: "shop_job_assigned" })).toBeNull();
  });

  it("route an incoming push to the call screen and a missed one to the job", () => {
    expect(pushTargetRoute(parsePushData({ type: "order_call_incoming", orderId: "ord_1", notificationId: "n1" }))).toBe(
      "/call?orderId=ord_1&mode=incoming",
    );
    expect(pushTargetRoute(parsePushData({ type: "order_call_missed", orderId: "ord_1", notificationId: "n2" }))).toBe("/job/ord_1");
  });
});
