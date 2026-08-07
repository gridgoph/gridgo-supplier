import {
  deriveProtectedPayment,
  isPayoutRelevant,
  presentPaymentMethod,
  settlementFromOrder,
  summarizePayouts,
} from "@/lib/payout";
import type { Order } from "@/lib/api";

function job(partial: Partial<Order> & Pick<Order, "id" | "state">): Order {
  return {
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    productId: "prod_tarpaulin",
    title: "Banner job",
    quantity: 1,
    size: "3x6",
    material: "tarpaulin",
    deadline: null,
    address: "Davao",
    zone: "davao_central",
    totalMinor: 120000,
    deliveryFeeMinor: 15000,
    paymentMethod: "pilot_credit",
    paymentStatus: "authorized",
    codEligible: true,
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

describe("deriveProtectedPayment", () => {
  it("uses totalMinor as gross and never invents commission or net", () => {
    const row = deriveProtectedPayment(
      job({ id: "ord_1", state: "ready_for_dispatch" }),
    );
    expect(row.grossMinor).toBe(120000);
    expect(row.commissionMinor).toBeNull();
    expect(row.netMinor).toBeNull();
    expect(row.settlement).toBe("held");
    expect(row.holdReason).toBeTruthy();
  });

  it("marks released only after payout_released", () => {
    expect(settlementFromOrder({ state: "completed", paymentStatus: "authorized" })).toBe(
      "settling",
    );
    expect(
      settlementFromOrder({ state: "payout_released", paymentStatus: "authorized" }),
    ).toBe("released");
  });

  it("labels payment methods in plain language", () => {
    expect(presentPaymentMethod("pilot_credit")).toBe("Pilot Credits");
    expect(presentPaymentMethod("cod")).toBe("Cash on delivery");
    expect(presentPaymentMethod(null)).toBe("Not set");
  });
});

describe("summarizePayouts", () => {
  it("sums held gross without inventing net", () => {
    const summary = summarizePayouts([
      job({ id: "a", state: "production", totalMinor: 10000 }),
      job({ id: "b", state: "payout_released", totalMinor: 20000 }),
      job({
        id: "c",
        state: "supplier_assigned",
        paymentStatus: "unpaid",
        totalMinor: 5000,
      }),
    ]);
    expect(summary.heldCount).toBe(1);
    expect(summary.releasedCount).toBe(1);
    expect(summary.heldGrossMinor).toBe(10000);
    expect(summary.amountsPartial).toBe(true);
  });

  it("includes authorized ready-for-dispatch jobs", () => {
    expect(isPayoutRelevant(job({ id: "x", state: "ready_for_dispatch" }))).toBe(true);
  });
});
