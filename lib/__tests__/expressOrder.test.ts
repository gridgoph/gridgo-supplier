import { acceptWindow, formatCountdown } from "@/lib/acceptWindow";
import { ApiError } from "@/lib/apiErrors";
import {
  awaitsCounterCode,
  counterCodeDigits,
  counterCodeOutcome,
  expressView,
  printChips,
  rangeLine,
} from "@/lib/expressOrder";
import { actionsForJob, presentJobStatus, routeForAction } from "@/lib/jobState";
import type { Order } from "@/lib/api";

const AT = "2026-11-19T02:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(AT) + ms);

const expressOrder = {
  status: "sending",
  acceptBy: "2026-11-19T02:05:00.000Z",
  declineCount: 0,
  events: [],
  printSettings: [
    {
      fileId: "file_1",
      pages: { total: 8, range: "1-3, 5", printed: 4 },
      copies: 2,
      colour: "bw",
      paper: "a4",
      paperStock: "80gsm",
      sides: "two",
      layout: "fit_to_paper",
      note: "Keep each copy together",
      acceptedWarnings: [],
    },
    { fileId: "file_2", pages: { total: 1, range: null, printed: 1 }, copies: 3, colour: "colour", paper: "long", sides: "one", layout: "actual_size_centered", note: "" },
  ],
};

const order = {
  id: "ord_x",
  state: "supplier_assigned",
  orderType: "express",
  fulfillmentMode: "pickup",
  expressOrder,
  timeline: [],
  shopAcceptance: { assignedAt: AT, deadlineAt: "2026-11-19T02:05:00.000Z", workingMinutes: 5, status: "pending" },
} as unknown as Order;

describe("expressView", () => {
  it("reads print settings and totals pages × copies", () => {
    const view = expressView(order)!;
    expect(view.fulfillment).toBe("pickup");
    expect(view.prints).toHaveLength(2);
    expect(view.totalPages).toBe(4 * 2 + 1 * 3);
    expect(printChips(view.prints[0])).toEqual(["4 pages", "× 2", "A4", "B&W", "2-sided", "Fit to page"]);
    expect(printChips(view.prints[1])).toEqual(["1 page", "× 3", "Long", "Colour", "1-sided", "Actual size"]);
    expect(rangeLine(view.prints[0])).toBe("Pages 1-3, 5 of 8");
    expect(rangeLine(view.prints[1])).toBeNull();
    expect(view.prints[0].note).toBe("Keep each copy together");
  });

  it("is null for every other order", () => {
    expect(expressView({ ...order, orderType: undefined })).toBeNull();
    expect(expressView(null)).toBeNull();
  });

  it("does not guess a page total when a count is missing", () => {
    const view = expressView({ ...order, expressOrder: { printSettings: [{ fileId: "f", copies: 2 }] } })!;
    expect(view.totalPages).toBeNull();
    expect(printChips(view.prints[0])).toEqual(["× 2"]);
  });
});

describe("the five-minute window", () => {
  it("counts down from 5:00 and turns to the last minute only at the end", () => {
    const start = acceptWindow(order, at(0));
    expect(start.kind).toBe("running");
    if (start.kind !== "running") return;
    expect(formatCountdown(start.remainingMs)).toBe("5:00");
    expect(start.closing).toBe(false);

    const late = acceptWindow(order, at(4 * 60_000 + 1_000));
    expect(late.kind === "running" && late.closing).toBe(true);
    expect(late.kind === "running" && formatCountdown(late.remainingMs)).toBe("0:59");
  });

  it("is over at the deadline exactly, and then offers nothing", () => {
    expect(acceptWindow(order, at(5 * 60_000)).kind).toBe("expired");
    expect(actionsForJob(order, at(5 * 60_000))).toEqual([]);
  });

  it("offers Accept and Decline while it runs", () => {
    const actions = actionsForJob(order, at(60_000));
    expect(actions.map((a) => [a.kind, a.label, a.primary])).toEqual([
      ["accept", "Accept", true],
      ["decline", "Decline", false],
    ]);
  });
});

describe("the counter code", () => {
  const ready = { ...order, state: "ready_for_dispatch", shopAcceptance: { ...order.shopAcceptance!, status: "accepted" as const }, expressOrder: { ...expressOrder, status: "ready" } } as Order;

  it("asks for the code on a ready pickup, and never on delivery", () => {
    expect(awaitsCounterCode(ready)).toBe(true);
    expect(awaitsCounterCode({ ...ready, fulfillmentMode: "delivery" })).toBe(false);
    expect(awaitsCounterCode({ ...ready, expressOrder: { ...expressOrder, status: "picked_up" } })).toBe(false);
    const [step] = actionsForJob(ready);
    expect(step.kind).toBe("enter_counter_code");
    expect(routeForAction(step.kind)).toBe("/job/[id]/counter-code");
    expect(presentJobStatus(ready).label).toBe("Ready for the client");
  });

  it("keeps leading zeroes and drops anything else", () => {
    expect(counterCodeDigits("012 345")).toBe("012345");
    expect(counterCodeDigits("0123456789")).toBe("012345");
  });

  it("reads a wrong code, a lock with its time, and anything else", () => {
    expect(counterCodeOutcome(new ApiError(409, { error: "express_pickup_code_mismatch" }))).toEqual({ kind: "wrong" });
    const until = "2026-11-19T02:15:00.000Z";
    expect(counterCodeOutcome(new ApiError(429, { error: "express_pickup_attempts_exceeded", retryAfter: until }), at(0))).toEqual({
      kind: "locked",
      until: new Date(until),
    });
    expect(counterCodeOutcome(new ApiError(429, { error: "express_pickup_attempts_exceeded" }), at(0))).toEqual({
      kind: "locked",
      until: null,
    });
    expect(counterCodeOutcome(new ApiError(409, { error: "payout_held" })).kind).toBe("other");
  });
});
