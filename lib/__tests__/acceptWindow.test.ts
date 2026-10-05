import type { Order } from "@/lib/api";
import {
  acceptWindow,
  acceptWindowLine,
  acceptWindowTickMs,
  answerByTime,
  formatCountdown,
} from "@/lib/acceptWindow";

type WindowOrder = Pick<Order, "state" | "shopAcceptance" | "shopRecovery">;

function assigned(assignedAt: string, deadlineAt: string, partial: Partial<WindowOrder> = {}): WindowOrder {
  return {
    state: "supplier_assigned",
    shopAcceptance: { assignedAt, deadlineAt, workingMinutes: 60, status: "pending" },
    shopRecovery: null,
    ...partial,
  };
}

// 2 PM to 3 PM Manila: the whole hour inside opening time.
const STRAIGHT = assigned("2026-10-05T06:00:00.000Z", "2026-10-05T07:00:00.000Z");
// 5:30 PM Monday; the shop closes at 6, so the hour finishes 8:30 AM Tuesday.
const OVERNIGHT = assigned("2026-10-05T09:30:00.000Z", "2026-10-06T00:30:00.000Z");

describe("the hour to answer a new job", () => {
  it("has no clock on a job that is not waiting for an answer", () => {
    const now = new Date("2026-10-05T06:10:00.000Z");
    expect(acceptWindow({ ...STRAIGHT, state: "production" }, now).kind).toBe("none");
    expect(acceptWindow({ state: "supplier_assigned", shopAcceptance: null, shopRecovery: null }, now).kind).toBe("none");
    expect(
      acceptWindow(
        assigned("2026-10-05T06:00:00.000Z", "2026-10-05T07:00:00.000Z", {
          shopAcceptance: {
            assignedAt: "2026-10-05T06:00:00.000Z",
            deadlineAt: "2026-10-05T07:00:00.000Z",
            workingMinutes: 60,
            status: "accepted",
          },
        }),
        now,
      ).kind,
    ).toBe("none");
    // A job the shop already let go is GRIDGO's, not a countdown.
    expect(acceptWindow({ ...STRAIGHT, shopRecovery: { id: "e1", status: "awaiting_client" } }, now).kind).toBe("none");
  });

  it("counts down plainly when the hour sits inside opening time", () => {
    const window = acceptWindow(STRAIGHT, new Date("2026-10-05T06:17:53.000Z"));
    expect(window).toMatchObject({ kind: "running", closing: false });
    if (window.kind !== "running") throw new Error("expected running");
    expect(formatCountdown(window.remainingMs)).toBe("42:07");
    expect(window.elapsed).toBeCloseTo(17.88 / 60, 2);
    expect(acceptWindowTickMs(window)).toBe(1000);
  });

  it("says when ten minutes or fewer are left", () => {
    const window = acceptWindow(STRAIGHT, new Date("2026-10-05T06:52:00.000Z"));
    expect(window).toMatchObject({ kind: "running", closing: true });
    expect(acceptWindowLine(window)).toBe("8 min left to answer");
    expect(acceptWindowLine(acceptWindow(STRAIGHT, new Date("2026-10-05T06:59:30.000Z")))).toBe(
      "Under a minute left to answer",
    );
  });

  it("does not race a wall clock through closed hours", () => {
    const now = new Date("2026-10-05T11:00:00.000Z");
    const window = acceptWindow(OVERNIGHT, now);
    expect(window.kind).toBe("spans_closed");
    // States the moment it runs out, never minutes that are really paused.
    expect(acceptWindowLine(window, now)).toMatch(/^Answer by .+ tomorrow$/);
    expect(acceptWindowTickMs(window)).toBe(30_000);
  });

  it("forgives the server's rounding on an hour inside opening time", () => {
    const window = acceptWindow(
      assigned("2026-10-05T06:00:00.000Z", "2026-10-05T07:00:30.000Z"),
      new Date("2026-10-05T06:10:00.000Z"),
    );
    expect(window.kind).toBe("running");
  });

  it("stops the clock at the deadline", () => {
    const window = acceptWindow(STRAIGHT, new Date("2026-10-05T07:00:00.000Z"));
    expect(window.kind).toBe("expired");
    expect(acceptWindowLine(window)).toBe("Time to answer has run out");
    expect(acceptWindowTickMs(window)).toBeNull();
  });

  it("names the day only when it is not today", () => {
    const now = new Date(2026, 9, 5, 15, 0);
    expect(answerByTime(new Date(2026, 9, 5, 15, 40), now)).not.toMatch(/tomorrow/);
    expect(answerByTime(new Date(2026, 9, 6, 8, 30), now)).toMatch(/tomorrow$/);
    expect(answerByTime(new Date(2026, 9, 8, 8, 30), now)).toMatch(/Oct/);
  });

  it("formats a countdown as minutes and seconds", () => {
    expect(formatCountdown(60 * 60_000)).toBe("60:00");
    expect(formatCountdown(61_000)).toBe("1:01");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
