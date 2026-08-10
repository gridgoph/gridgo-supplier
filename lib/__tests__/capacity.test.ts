import type { Order, SupplierService } from "@/lib/api";
import {
  CAPACITY_BOUNDS,
  capacityDraftChanged,
  capacityDraftFor,
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
    turnaroundHours: 48,
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
    codEligible: true,
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
    expect(clampCapacity("turnaround", 0)).toBe(CAPACITY_BOUNDS.turnaround.min);
  });

  it("falls back to the minimum for a value that is not a number", () => {
    expect(clampCapacity("weekly", Number.NaN)).toBe(CAPACITY_BOUNDS.weekly.min);
  });
});

describe("validateCapacity", () => {
  it("accepts a sane set", () => {
    expect(
      validateCapacity({ capacityDaily: 20, capacityWeekly: 100, turnaroundHours: 24 }),
    ).toBeNull();
  });

  it("catches a weekly figure below the daily one", () => {
    const problem = validateCapacity({
      capacityDaily: 40,
      capacityWeekly: 10,
      turnaroundHours: 24,
    });
    expect(problem).toContain("Weekly capacity is lower");
  });

  it("allows an unset weekly figure", () => {
    expect(
      validateCapacity({ capacityDaily: 40, capacityWeekly: 0, turnaroundHours: 24 }),
    ).toBeNull();
  });

  it("rejects an out-of-range turnaround", () => {
    expect(
      validateCapacity({ capacityDaily: 1, capacityWeekly: 1, turnaroundHours: 5000 }),
    ).toContain("Turnaround");
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
      job({ id: "a", quantity: 5, promisedDate: "2026-08-08T10:00:00+08:00" }),
      job({ id: "b", quantity: 3, promisedDate: "2026-08-08T18:00:00+08:00" }),
      job({ id: "c", quantity: 7, promisedDate: "2026-08-09T10:00:00+08:00" }),
    ]);

    expect(load.get("2026-08-08")).toEqual({ dayKey: "2026-08-08", jobCount: 2, units: 8 });
    expect(load.get("2026-08-09")?.units).toBe(7);
  });

  it("falls back to the client deadline when nothing is promised", () => {
    const load = loadByDay([job({ id: "a", quantity: 2, deadline: "2026-08-08T10:00:00+08:00" })]);
    expect(load.get("2026-08-08")?.units).toBe(2);
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
      turnaroundHours: 48,
    });
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
    expect(presentServiceState("pending_verification")).toBe("Waiting on Operations");
    expect(presentServiceState("something_new")).not.toContain("_");
  });
});
