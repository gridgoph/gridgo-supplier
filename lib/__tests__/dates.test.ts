import { formatRelativeDay, nextPromisedDeadline } from "@/lib/dates";

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
