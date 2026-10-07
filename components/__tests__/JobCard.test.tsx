import { render, screen } from "@testing-library/react-native";

import { JobCard } from "@/components/JobCard";
import type { Order, ProductionItem } from "@/lib/api";
import { formatDeadlineFull } from "@/lib/dates";

jest.mock("@/hooks/useNow", () => ({
  useNow: () => new Date("2026-10-08T12:00:00+08:00"),
}));

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

const readyBy = "2026-10-08T10:00:00+08:00";
const promisedDate = "2026-10-09T12:00:00+08:00";
const deadline = "2026-10-10T12:00:00+08:00";

it("shows the shop ready-by date and lateness even when both client dates are later", async () => {
  await render(<JobCard job={{ ...job, readyBy, promisedDate, deadline }} onPress={() => {}} />);
  expect(screen.getByText(`Ready by ${formatDeadlineFull(readyBy)} · Late by 2 hours`)).toBeTruthy();
  expect(screen.getByRole("button", { name: /late/ })).toBeTruthy();
  expect(screen.queryByText(new RegExp(formatDeadlineFull(promisedDate), "i"))).toBeNull();
  expect(screen.queryByText(new RegExp(formatDeadlineFull(deadline), "i"))).toBeNull();
});

it("uses the ready-by date for due wording when the client deadline has passed", async () => {
  const readyBy = "2026-10-08T18:00:00+08:00";
  await render(<JobCard job={{ ...job, readyBy, deadline: "2026-10-07T12:00:00+08:00" }} />);
  expect(screen.getByText(`Ready by ${formatDeadlineFull(readyBy)} · Due in 6 hours`)).toBeTruthy();
});

it.each([null, undefined])("falls back to the promised date when readyBy is %s", async (readyBy) => {
  await render(<JobCard job={{ ...job, readyBy, promisedDate, deadline }} />);
  expect(screen.getByText(`${formatDeadlineFull(promisedDate)} · Due in 24 hours`)).toBeTruthy();
  expect(screen.queryByText(/^Ready by/)).toBeNull();
});

it("uses the legacy deadline when neither ready-by nor promised date is available", async () => {
  await render(<JobCard job={{ ...job, deadline }} />);
  expect(screen.getByText(`${formatDeadlineFull(deadline)} · Due in 2 days`)).toBeTruthy();
});

it("keeps an undated job readable without inventing a date or urgency", async () => {
  await render(<JobCard job={job} />);
  expect(screen.getByText("Not set")).toBeTruthy();
  expect(screen.queryByText(/Ready by|Due in|Late by/)).toBeNull();
});

it("keeps the acceptance clock separate from the production ready-by date", async () => {
  await render(<JobCard job={{ ...job, state: "supplier_assigned", readyBy, promisedDate, deadline,
    shopAcceptance: {
      status: "pending", assignedAt: "2026-10-08T11:30:00+08:00",
      deadlineAt: "2026-10-08T12:30:00+08:00", workingMinutes: 60,
    },
  }} />);
  expect(screen.getByText("30 min left to answer")).toBeTruthy();
  expect(screen.getByText(`Ready by ${formatDeadlineFull(readyBy)} · Late by 2 hours`)).toBeTruthy();
});

it("keeps released jobs free of due or late wording", async () => {
  await render(<JobCard job={{ ...job, readyBy, promisedDate, deadline,
    shopRecovery: { id: "recovery_1", status: "awaiting_client" },
  }} onPress={() => {}} />);
  expect(screen.getByText(`Ready by ${formatDeadlineFull(readyBy)}`)).toBeTruthy();
  expect(screen.queryByText(/Due in|Late by/)).toBeNull();
  expect(screen.queryByRole("button", { name: /late/ })).toBeNull();
});

it.each([
  "cancelled", "delivered", "issue_window_open", "completed", "payout_released",
].flatMap((state) => [readyBy, deadline].map((readyBy) => ({ state, readyBy }))))(
  "shows the recorded date without due or late wording for $state at $readyBy",
  async ({ state, readyBy }) => {
    await render(<JobCard job={{ ...job, state, readyBy }} onPress={() => {}} />);
    const date = screen.getByText(`Ready by ${formatDeadlineFull(readyBy)}`);
    expect(date.props.className).toBe("text-body text-text-secondary");
    expect(screen.queryByText(/Due in|Late by/)).toBeNull();
    expect(screen.queryByRole("button", { name: /late/i })).toBeNull();
  },
);

it.each(["cancelled", "fulfilled_with_refund"] as const)(
  "does not count down a job closed by a %s refund settlement",
  async (refundDisposition) => {
    await render(<JobCard job={{ ...job, readyBy, refundDisposition }} onPress={() => {}} />);
    expect(screen.queryByText(/Due in|Late by/)).toBeNull();
    expect(screen.queryByRole("button", { name: /late/i })).toBeNull();
  },
);
