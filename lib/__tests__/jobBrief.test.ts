import type { Order } from "@/lib/api";
import {
  artworkSummary,
  defaultBriefSection,
  deliverySummary,
  distanceLabel,
  earningsSummary,
  jobBriefSections,
  makeSummary,
  mockupSummary,
  workspaceBriefSections,
} from "@/lib/jobBrief";

function order(partial: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    state: "supplier_assigned",
    productId: "prod_flyers",
    title: "Flyers",
    quantity: 500,
    size: "A5",
    material: "130gsm_gloss",
    deadline: "2026-09-22T09:00:00+08:00",
    address: "Bajada, Davao City",
    zone: "davao_central",
    supplierPriceMinor: 100000,
    totalMinor: 112500,
    deliveryFeeMinor: 2500,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

describe("job brief summaries", () => {
  it("states the single item as count, name, size and material", () => {
    expect(makeSummary(order())).toBe("500 × Flyers · A5 · 130gsm gloss");
  });

  it("counts items and pieces when the job has several", () => {
    const items = [
      { id: "l1", itemName: "Flyers", quantity: 500, pricingUnit: null, packageQty: null, measurement: null, structuredSpec: {}, options: [], artworkFileId: "f1", mockupFileId: null },
      { id: "l2", itemName: "Posters", quantity: 20, pricingUnit: null, packageQty: null, measurement: null, structuredSpec: {}, options: [], artworkFileId: "f2", mockupFileId: "m1" },
    ];
    expect(makeSummary(order({ productionItems: items }))).toBe("2 items · 520 pieces");
    expect(artworkSummary(order({ productionItems: items }))).toEqual({ summary: "2 print files", empty: false });
    expect(mockupSummary(order({ productionItems: items }))).toEqual({ summary: "1 reference picture", empty: false });
  });

  it("says plainly when nothing is attached, and marks the row as not openable", () => {
    expect(artworkSummary(order())).toEqual({ summary: "No print file attached yet", empty: true });
    expect(mockupSummary(order())).toEqual({ summary: "None attached — go by the artwork", empty: true });
  });

  it("prefers the shop's own ready-by date over the client's need-by", () => {
    expect(deliverySummary(order({ readyBy: "2026-09-20T17:00:00+08:00" }))).toMatch(/^Ready by /);
    expect(deliverySummary(order())).toMatch(/^Client needs it by /);
    expect(deliverySummary(order({ deadline: null }))).toBe("Date not set yet");
  });

  it("states the shop's price, never the client's total", () => {
    // Every new commitment pays out on the three-part escrow plan.
    expect(earningsSummary(order())).toBe("₱1,000.00 · paid in three parts");
    expect(earningsSummary(order({ payoutPlanVersion: 2 }))).toBe("₱1,000.00 · paid in three parts");
    expect(earningsSummary(order({ payoutPlanVersion: 1 }))).toBe("₱1,000.00 · paid in four parts");
    expect(earningsSummary(order({ supplierPriceMinor: undefined }))).toBe("Price not recorded yet");
  });

  it("rounds a distance the way a shop would say it", () => {
    expect(distanceLabel(640)).toBe("640 m from your shop");
    expect(distanceLabel(3240)).toBe("3.2 km from your shop");
    expect(distanceLabel(undefined)).toBeNull();
  });

  it("keeps the rows in the requested order", () => {
    expect(jobBriefSections(order(), ["delivery", "make"]).map((row) => row.id)).toEqual(["delivery", "make"]);
    expect(jobBriefSections(order()).map((row) => row.title)).toEqual([
      "What to make",
      "Artwork",
      "How it should look",
      "Where and when",
      "Your earnings",
    ]);
  });

  it("opens the row the next step is about", () => {
    expect(defaultBriefSection(order())).toBe("make");
    expect(defaultBriefSection(order({ state: "payment_authorized" }))).toBe("make");
    expect(
      defaultBriefSection(
        order({
          state: "production",
          payoutMilestones: [
            { code: "printing", sharePercent: 50, amountMinor: 50000, status: "pending_pof", pofFileIds: [], releasedAt: null },
          ],
        }),
      ),
    ).toBe("earnings");
    expect(defaultBriefSection(order({ state: "rider_assigned" }))).toBe("handoff");
    expect(
      defaultBriefSection(
        order({
          state: "delivered",
          payoutMilestones: [
            { code: "printing", sharePercent: 50, amountMinor: 50000, status: "released", pofFileIds: [], releasedAt: "2026-09-16T00:00:00Z" },
          ],
        }),
      ),
    ).toBe("earnings");
  });

  it("adds the pickup row only while there is a package to hand over", () => {
    expect(workspaceBriefSections(order())).toEqual(["make", "artwork", "mockup", "delivery", "earnings", "history"]);
    expect(workspaceBriefSections(order({ state: "ready_for_dispatch" }))).toContain("handoff");
    expect(workspaceBriefSections(order({ state: "delivered" }))).not.toContain("handoff");
  });
});
