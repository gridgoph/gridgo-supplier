import { buildSchedule, isAgendaEligible, isStillInShop } from "@/lib/schedule";
import type { Order } from "@/lib/api";

function job(partial: Partial<Order> & Pick<Order, "id" | "state">): Order {
  return {
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    productId: "prod_tarpaulin",
    title: "Test",
    quantity: 1,
    size: "A4",
    material: "matte",
    deadline: null,
    address: "Davao",
    zone: "davao_central",
    totalMinor: 10000,
    deliveryFeeMinor: 1000,
    paymentMethod: null,
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

describe("isAgendaEligible", () => {
  it("excludes unassigned and pre-accept states", () => {
    expect(isAgendaEligible({ state: "supplier_assigned" })).toBe(false);
    expect(isAgendaEligible({ state: "approved_for_matching" })).toBe(false);
    expect(isAgendaEligible({ state: "supplier_accepted" })).toBe(true);
    expect(isAgendaEligible({ state: "production" })).toBe(true);
  });
});

describe("isStillInShop", () => {
  it("stops counting a job once a rider has it", () => {
    expect(isStillInShop({ state: "ready_for_dispatch" })).toBe(true);
    expect(isStillInShop({ state: "rider_assigned" })).toBe(true);
    expect(isStillInShop({ state: "picked_up" })).toBe(false);
    expect(isStillInShop({ state: "delivered" })).toBe(false);
  });
});

describe("buildSchedule", () => {
  const now = new Date("2026-08-08T08:00:00+08:00");

  it("puts each dated job on its own calendar day", () => {
    const schedule = buildSchedule(
      [
        job({ id: "today", state: "production", promisedDate: "2026-08-08T15:00:00+08:00" }),
        job({ id: "friday", state: "supplier_accepted", promisedDate: "2026-08-12T15:00:00+08:00" }),
        job({ id: "pending", state: "supplier_assigned", promisedDate: "2026-08-08T12:00:00+08:00" }),
      ],
      "week",
      now,
    );

    const today = schedule.days.find((d) => d.offset === 0);
    const friday = schedule.days.find((d) => d.offset === 4);
    expect(today?.jobs.map((j) => j.id)).toEqual(["today"]);
    expect(friday?.jobs.map((j) => j.id)).toEqual(["friday"]);
  });

  it("shows every day in the window, including empty ones", () => {
    const schedule = buildSchedule([], "week", now);
    expect(schedule.days).toHaveLength(8);
    expect(schedule.days.every((d) => d.jobs.length === 0)).toBe(true);
  });

  it("narrows to a single day for the Today range", () => {
    const schedule = buildSchedule([], "today", now);
    expect(schedule.days).toHaveLength(1);
    expect(schedule.days[0].offset).toBe(0);
  });

  it("lifts jobs promised in the past into the late list", () => {
    const schedule = buildSchedule(
      [job({ id: "overdue", state: "production", promisedDate: "2026-08-05T15:00:00+08:00" })],
      "week",
      now,
    );

    expect(schedule.lateJobs.map((j) => j.id)).toEqual(["overdue"]);
    expect(schedule.summary.late).toBe(1);
  });

  it("does not call a job late once the rider has taken it", () => {
    const schedule = buildSchedule(
      [job({ id: "gone", state: "picked_up", promisedDate: "2026-08-05T15:00:00+08:00" })],
      "week",
      now,
    );
    expect(schedule.lateJobs).toEqual([]);
  });

  it("keeps undated accepted work visible instead of dropping it", () => {
    const schedule = buildSchedule([job({ id: "nodate", state: "production" })], "week", now);
    expect(schedule.undatedJobs.map((j) => j.id)).toEqual(["nodate"]);
  });

  it("counts today and the week from real dates", () => {
    const schedule = buildSchedule(
      [
        job({ id: "a", state: "production", promisedDate: "2026-08-08T09:00:00+08:00" }),
        job({ id: "b", state: "production", promisedDate: "2026-08-08T17:00:00+08:00" }),
        job({ id: "c", state: "production", promisedDate: "2026-08-14T09:00:00+08:00" }),
        job({ id: "d", state: "production", promisedDate: "2026-09-30T09:00:00+08:00" }),
      ],
      "week",
      now,
    );

    expect(schedule.summary.today).toBe(2);
    expect(schedule.summary.week).toBe(3);
  });

  it("shows work beyond the window only in the All range", () => {
    const far = job({ id: "far", state: "production", promisedDate: "2026-09-30T09:00:00+08:00" });

    expect(buildSchedule([far], "week", now).days.some((d) => d.jobs.length)).toBe(false);
    expect(buildSchedule([far], "all", now).days.some((d) => d.jobs.length)).toBe(true);
  });
});
