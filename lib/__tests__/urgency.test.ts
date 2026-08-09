import { deadlineUrgency, humanSpan } from "@/lib/urgency";

const now = new Date("2026-08-08T08:00:00+08:00");

describe("deadlineUrgency", () => {
  it("says how late a job is, not just that it is late", () => {
    const result = deadlineUrgency("2026-08-08T05:00:00+08:00", now);
    expect(result.level).toBe("overdue");
    expect(result.label).toBe("Late by 3 hours");
    expect(result.tone).toBe("error");
  });

  it("escalates inside twelve hours", () => {
    expect(deadlineUrgency("2026-08-08T15:00:00+08:00", now).level).toBe("urgent");
  });

  it("is merely soon inside two days", () => {
    expect(deadlineUrgency("2026-08-09T15:00:00+08:00", now).level).toBe("soon");
  });

  it("is quiet further out", () => {
    const result = deadlineUrgency("2026-08-20T15:00:00+08:00", now);
    expect(result.level).toBe("ok");
    expect(result.tone).toBe("neutral");
  });

  it("says there is no date rather than inventing one", () => {
    expect(deadlineUrgency(null, now).level).toBe("undated");
    expect(deadlineUrgency("not a date", now).level).toBe("undated");
    expect(deadlineUrgency(null, now).hoursRemaining).toBeNull();
  });

  it("always carries an icon so the state survives greyscale", () => {
    expect(deadlineUrgency("2026-08-08T05:00:00+08:00", now).icon).toBe("triangle-alert");
    expect(deadlineUrgency("2026-08-20T05:00:00+08:00", now).icon).toBe("clock");
  });
});

describe("humanSpan", () => {
  it("uses minutes, hours and days as a person would", () => {
    expect(humanSpan(0.5)).toBe("30 minutes");
    expect(humanSpan(1)).toBe("1 hour");
    expect(humanSpan(5)).toBe("5 hours");
    expect(humanSpan(72)).toBe("3 days");
  });

  it("never rounds down to zero", () => {
    expect(humanSpan(0.001)).toBe("1 minute");
  });
});
