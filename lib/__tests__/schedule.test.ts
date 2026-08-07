import { buildAgenda, isAgendaEligible } from "@/lib/schedule";
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
    codEligible: true,
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

describe("buildAgenda", () => {
  const now = new Date("2026-08-08T08:00:00+08:00");

  it("groups into Today and Next 7 days", () => {
    const sections = buildAgenda(
      [
        job({
          id: "today",
          state: "production",
          promisedDate: "2026-08-08T15:00:00+08:00",
        }),
        job({
          id: "week",
          state: "supplier_accepted",
          promisedDate: "2026-08-12T15:00:00+08:00",
        }),
        job({
          id: "pending",
          state: "supplier_assigned",
          promisedDate: "2026-08-08T12:00:00+08:00",
        }),
      ],
      now,
    );

    const today = sections.find((s) => s.id === "today");
    const next7 = sections.find((s) => s.id === "next7");
    expect(today?.jobs.map((j) => j.id)).toEqual(["today"]);
    expect(next7?.jobs.map((j) => j.id)).toEqual(["week"]);
  });

  it("surfaces overdue accepted jobs under Today", () => {
    const sections = buildAgenda(
      [
        job({
          id: "overdue",
          state: "production",
          promisedDate: "2026-08-05T15:00:00+08:00",
        }),
      ],
      now,
    );
    expect(sections.find((s) => s.id === "today")?.jobs[0]?.id).toBe("overdue");
  });
});
