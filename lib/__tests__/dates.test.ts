import { formatClockTime, formatRelativeDay, nextPromisedDeadline } from "@/lib/dates";

describe("formatRelativeDay", () => {
  const now = new Date("2026-08-08T12:00:00+08:00");

  it("labels today and tomorrow", () => {
    expect(formatRelativeDay("2026-08-08T17:00:00+08:00", now)).toBe("Today");
    expect(formatRelativeDay("2026-08-09T09:00:00+08:00", now)).toBe("Tomorrow");
  });

  it("flags overdue days", () => {
    expect(formatRelativeDay("2026-08-06T09:00:00+08:00", now)).toBe("2 days overdue");
  });
});

describe("formatClockTime", () => {
  it("shows the local clock with seconds, in the same locale as other times", () => {
    const stamp = formatClockTime(new Date(2026, 8, 1, 12, 59, 30));
    expect(stamp).toMatch(/12:59:30/);
    expect(stamp).toMatch(/PM/i);
  });

  it("can drop seconds when the clock should sit still", () => {
    const stamp = formatClockTime(new Date(2026, 8, 1, 12, 59, 30), { seconds: false });
    expect(stamp).toMatch(/12:59/);
    expect(stamp).not.toMatch(/12:59:30/);
  });
});

describe("nextPromisedDeadline", () => {
  const now = new Date("2026-08-08T12:00:00+08:00");

  it("returns the earliest upcoming promised or deadline stamp", () => {
    const next = nextPromisedDeadline(
      [
        { promisedDate: "2026-08-12T17:00:00+08:00", deadline: null },
        { promisedDate: null, deadline: "2026-08-10T09:00:00+08:00" },
      ],
      now,
    );
    expect(next).toBe("2026-08-10T09:00:00+08:00");
  });

  it("returns null when nothing is dated", () => {
    expect(nextPromisedDeadline([{ promisedDate: null, deadline: null }], now)).toBeNull();
  });
});
