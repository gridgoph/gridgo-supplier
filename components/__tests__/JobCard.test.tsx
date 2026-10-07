import { render, screen } from "@testing-library/react-native";

import { JobCard } from "@/components/JobCard";
import type { Order, ProductionItem } from "@/lib/api";

const item: ProductionItem = {
  id: "line_1", itemName: "Flyers", quantity: 100, pricingUnit: "per_piece",
  packageQty: null, measurement: null, structuredSpec: { material: "gloss_paper" },
  options: [{ groupName: "Size", label: "A5" }], artworkFileId: null, mockupFileId: null,
};
const job: Order = {
  id: "ord_12345678", clientId: "client", supplierId: "supplier", riderId: null,
  state: "production", productId: "flyers", title: "Flyers", quantity: 100,
  size: "", material: "", deadline: null, address: "", zone: "",
  supplierPriceMinor: 40000, totalMinor: 51500, deliveryFeeMinor: 1500,
  paymentMethod: null, paymentStatus: "paid", promisedDate: null, artworkName: null,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", timeline: [],
  productionItems: [item],
};

it("shows the shop price instead of the client total", async () => {
  await render(<JobCard job={job} />);
  expect(screen.getByText(/₱400\.00/)).toBeTruthy();
  expect(screen.queryByText(/₱515\.00|₱15\.00/)).toBeNull();
});

it("does not substitute client money when the shop price is missing", async () => {
  await render(<JobCard job={{ ...job, supplierPriceMinor: undefined }} />);
  expect(screen.getByText(/Price not recorded yet/)).toBeTruthy();
  expect(screen.queryByText(/₱/)).toBeNull();
});

it("preserves a recorded zero shop price", async () => {
  await render(<JobCard job={{ ...job, supplierPriceMinor: 0 }} />);
  expect(screen.getByText(/₱0\.00/)).toBeTruthy();
});

it.each(["Size", "Paper size"])("reads the chosen %s from the listing option snapshot", async (groupName) => {
  await render(<JobCard job={{ ...job, productionItems: [{ ...item, options: [{ groupName, label: "A5" }] }] }} />);
  expect(screen.getByText(/100 × A5 · gloss paper/)).toBeTruthy();
  expect(screen.queryByText(/size not set/)).toBeNull();
});

it("retains legacy size and material when there are no production items", async () => {
  await render(<JobCard job={{ ...job, productionItems: undefined, size: "A4", material: "matte" }} />);
  expect(screen.getByText(/100 × A4 · matte/)).toBeTruthy();
});

it("keeps each item's quantity and size together in multi-item jobs", async () => {
  await render(<JobCard job={{ ...job, productionItems: [item, {
    ...item, id: "line_2", quantity: 20, structuredSpec: { size: "A3" }, options: [],
  }] }} />);
  expect(screen.getByText(/100 × A5 · gloss paper; 20 × A3/)).toBeTruthy();
});

it("does not mistake an unrelated option for a missing size", async () => {
  await render(<JobCard job={{ ...job, productionItems: [{ ...item, options: [{ groupName: "Sides", label: "Both sides" }] }] }} />);
  expect(screen.getByText(/100 × size not set/)).toBeTruthy();
});
