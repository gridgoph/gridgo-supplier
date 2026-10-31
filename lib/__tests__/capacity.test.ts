import type { Order, SupplierService } from "@/lib/api";
import { sameDay, workingDays } from "@/lib/productionDays";
import {
  CAPACITY_BOUNDS,
  capacityDraftChanged,
  capacityDraftFor,
  capacityPatch,
  capacityForDay,
  clampCapacity,
  loadByDay,
  presentServiceState,
  shopDailyCapacity,
  validateCapacity,
} from "@/lib/capacity";

function service(partial: Partial<SupplierService> = {}): SupplierService {
  return {
    id: "svc_1",
    supplierId: "user_supplier",
    categoryCode: "large_format",
    materialCodes: [],
    finishCodes: [],
    productFamilyIds: [],
    sizeMin: null,
    sizeMax: null,
    qtyMin: null,
    qtyMax: null,
    pricingBasis: "per_unit",
    referenceRateMinor: 0,
    turnaroundDays: 2,
    capacityDaily: 20,
    capacityWeekly: 100,
    zones: [],
    equipmentNotes: "",
    state: "live",
    verifiedAt: null,
    suspendedAt: null,
    suspendReason: null,
    withdrawnAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

function job(partial: Partial<Order> & Pick<Order, "id">): Order {
  return {
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    state: "production",
    productId: "prod",
    title: "Job",
    quantity: 1,
    size: "A4",
    material: "matte",
    deadline: null,
    address: "Davao",
    zone: "davao_central",
    totalMinor: 1000,
    deliveryFeeMinor: 100,
    paymentMethod: null,
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

describe("clampCapacity", () => {
  it("holds every value inside its own bounds", () => {
    expect(clampCapacity("daily", -5)).toBe(CAPACITY_BOUNDS.daily.min);
    expect(clampCapacity("daily", 99999)).toBe(CAPACITY_BOUNDS.daily.max);
  });

  it("falls back to the minimum for a value that is not a number", () => {
    expect(clampCapacity("weekly", Number.NaN)).toBe(CAPACITY_BOUNDS.weekly.min);
  });
});

describe("validateCapacity", () => {
  it("accepts a sane set", () => {
    expect(
      validateCapacity({ capacityDaily: 20, capacityWeekly: 100, turnaround: workingDays(1), productionDayMinutes: 600 }),
    ).toBeNull();
  });

  it("catches a weekly figure below the daily one", () => {
    const problem = validateCapacity({
      capacityDaily: 40,
      capacityWeekly: 10,
      turnaround: workingDays(1),
      productionDayMinutes: 600,
    });
    expect(problem).toContain("Weekly capacity is lower");
  });

  it("allows an unset weekly figure", () => {
    expect(
      validateCapacity({ capacityDaily: 40, capacityWeekly: 0, turnaround: workingDays(1), productionDayMinutes: 600 }),
    ).toBeNull();
  });

  it("rejects an out-of-range production time", () => {
    expect(
      validateCapacity({ capacityDaily: 1, capacityWeekly: 1, turnaround: workingDays(5000), productionDayMinutes: 600 }),
    ).toContain("Production time");
  });

  it("takes a same-day time under the shop's working day, and refuses one a day long", () => {
    expect(
      validateCapacity({ capacityDaily: 1, capacityWeekly: 1, turnaround: sameDay(90), productionDayMinutes: 600 }),
    ).toBeNull();
    expect(
      validateCapacity({ capacityDaily: 1, capacityWeekly: 1, turnaround: sameDay(480), productionDayMinutes: 480 }),
    ).toContain("working days");
  });
});

describe("shopDailyCapacity", () => {
  it("totals only the live lines", () => {
    expect(
      shopDailyCapacity([
        service({ id: "a", capacityDaily: 20 }),
        service({ id: "b", capacityDaily: 40 }),
        service({ id: "c", capacityDaily: 999, state: "pending_verification" }),
      ]),
    ).toBe(60);
  });

  it("says nothing rather than guessing when no live line has a figure", () => {
    expect(shopDailyCapacity([service({ capacityDaily: null })])).toBeNull();
    expect(shopDailyCapacity([])).toBeNull();
  });
});

describe("loadByDay", () => {
  it("adds up quantities on the day each job is promised", () => {
    const load = loadByDay([
      job({ id: "a", quantity: 5, readyBy: "2026-08-08T10:00:00+08:00" }),
      job({ id: "b", quantity: 3, readyBy: "2026-08-08T18:00:00+08:00" }),
      job({ id: "c", quantity: 7, readyBy: "2026-08-09T10:00:00+08:00" }),
    ]);

    expect(load.get("2026-08-08")).toEqual({ dayKey: "2026-08-08", jobCount: 2, units: 8 });
    expect(load.get("2026-08-09")?.units).toBe(7);
  });

  it("never books a day from the client's deadline or promised date", () => {
    const load = loadByDay([
      job({ id: "a", quantity: 2, deadline: "2026-08-08T10:00:00+08:00", promisedDate: "2026-08-08T09:00:00+08:00" }),
    ]);
    expect(load.size).toBe(0);
  });

  it("ignores a job with no date at all", () => {
    expect(loadByDay([job({ id: "a" })]).size).toBe(0);
  });
});

describe("capacityForDay", () => {
  it("flags a day that is oversold", () => {
    const result = capacityForDay({ dayKey: "2026-08-08", jobCount: 3, units: 80 }, 60);
    expect(result.over).toBe(true);
    expect(result.fraction).toBe(1);
  });

  it("reports no capacity rather than a fake one", () => {
    const result = capacityForDay({ dayKey: "2026-08-08", jobCount: 1, units: 5 }, null);
    expect(result.over).toBe(false);
    expect(result.fraction).toBeNull();
  });

  it("treats an empty day as zero committed", () => {
    expect(capacityForDay(undefined, 60).committedUnits).toBe(0);
  });
});

describe("capacity drafts", () => {
  it("starts from what the API holds, with its defaults", () => {
    expect(capacityDraftFor(service({ capacityDaily: null, capacityWeekly: null }))).toEqual({
      capacityDaily: 0,
      capacityWeekly: 0,
      turnaround: workingDays(2),
      productionDayMinutes: null,
    });
  });

  it("reads the line's production time in its own unit, never rounding hours up into days", () => {
    expect(capacityDraftFor(service({ turnaroundDays: 3 })).turnaround).toEqual(workingDays(3));
    expect(
      capacityDraftFor(service({ turnaroundDays: null, turnaroundMinutes: 90, productionDayMinutes: 600 })),
    ).toEqual(expect.objectContaining({ turnaround: sameDay(90), productionDayMinutes: 600 }));
    // An older GRIDGO's hours are exact time, as GRIDGO itself now reads them.
    expect(
      capacityDraftFor(service({ turnaroundDays: undefined, turnaroundHours: 48 })).turnaround,
    ).toEqual(sameDay(2880));
    expect(capacityDraftFor(service({ turnaroundDays: null })).turnaround).toEqual(workingDays(2));
  });

  it("saves only the chosen unit's field", () => {
    const draft = { ...capacityDraftFor(service()), turnaround: sameDay(120) };
    expect(capacityPatch(draft)).toEqual({ capacityDaily: draft.capacityDaily, capacityWeekly: draft.capacityWeekly, turnaroundMinutes: 120 });
    expect(capacityPatch({ ...draft, turnaround: workingDays(3) })).toEqual(
      expect.objectContaining({ turnaroundDays: 3 }),
    );
    expect(capacityPatch({ ...draft, turnaround: workingDays(3) })).not.toHaveProperty("turnaroundMinutes");
  });

  it("only reports a change when a number actually moved", () => {
    const line = service();
    expect(capacityDraftChanged(line, capacityDraftFor(line))).toBe(false);
    expect(
      capacityDraftChanged(line, { ...capacityDraftFor(line), capacityDaily: 25 }),
    ).toBe(true);
  });
});

describe("presentServiceState", () => {
  it("never shows the raw state string", () => {
    expect(presentServiceState("pending_verification")).toBe("Submitted");
    expect(presentServiceState("something_new")).not.toContain("_");
  });
});
