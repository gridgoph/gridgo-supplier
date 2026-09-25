import { fireEvent, render, screen } from "@testing-library/react-native";

import { JobBrief } from "@/components/JobBrief";
import type { Order } from "@/lib/api";

jest.mock("@/components/ArtworkPanel", () => ({
  ArtworkPanel: ({ kinds }: { kinds?: string[] }) => {
    const { Text: T } = jest.requireActual<typeof import("react-native")>("react-native");
    return <T>{`panel:${(kinds ?? []).join(",")}`}</T>;
  },
}));

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
    material: "130gsm gloss",
    deadline: "2026-09-22T09:00:00+08:00",
    address: "Bajada, Davao City",
    zone: "davao_central",
    supplierPriceMinor: 100000,
    totalMinor: 112500,
    deliveryFeeMinor: 2500,
    deliveryDistanceMeters: 3200,
    readyBy: "2026-09-20T17:00:00+08:00",
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    artworkFileIds: ["file_art"],
    mockupFileIds: ["file_mock"],
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

describe("JobBrief", () => {
  it("reads the whole offer from the closed rows", async () => {
    await render(<JobBrief order={order()} defaultOpen={null} />);

    expect(screen.getByText("500 × Flyers · A5 · 130gsm gloss")).toBeTruthy();
    expect(screen.getByText("1 print file")).toBeTruthy();
    expect(screen.getByText("1 reference picture")).toBeTruthy();
    expect(screen.getByText(/^Ready by /)).toBeTruthy();
    expect(screen.getByText("₱1,000.00 · paid in three parts")).toBeTruthy();
    expect(screen.queryByTestId("job-brief-make")).toBeNull();
  });

  it("explains the three-part escrow payout before the job is split, with no retention", async () => {
    await render(<JobBrief order={order({ payoutPlanVersion: 2 })} defaultOpen="earnings" />);

    expect(screen.getByText(/^In three parts as the job moves — 40% once you file a photo that production has started/)).toBeTruthy();
    expect(screen.queryByText(/retention|four parts|printing, packaging/i)).toBeNull();
  });

  it("keeps the four-part wording on a legacy plan-1 job", async () => {
    await render(<JobBrief order={order({ payoutPlanVersion: 1 })} defaultOpen="earnings" />);

    expect(screen.getByText("₱1,000.00 · paid in four parts")).toBeTruthy();
    expect(screen.getByText(/^In four parts as the job moves — printing, packaging, delivery/)).toBeTruthy();
  });

  it("lists a plan-2 job's parts in GRIDGO's order under GRIDGO's labels", async () => {
    await render(
      <JobBrief
        order={order({
          state: "production",
          payoutPlanVersion: 2,
          payoutMilestones: [
            { code: "production_started", label: "Start of production", releaseRequires: "shop_proof", sharePercent: 40, amountMinor: 40000, status: "pending_pof", pofFileIds: [], releasedAt: null },
            { code: "delivered", label: "Delivered", releaseRequires: "delivery_proof", sharePercent: 35, amountMinor: 35000, status: "pending_pof", pofFileIds: [], releasedAt: null },
            { code: "issue_window", label: "Issue window closed", releaseRequires: "issue_window_closed", sharePercent: 25, amountMinor: 25000, status: "pending_pof", pofFileIds: [], releasedAt: null },
          ],
        })}
        defaultOpen="earnings"
      />,
    );

    expect(screen.getByText("₱400.00 waiting on your proof")).toBeTruthy();
    const labels = ["Start of production", "Delivered", "Issue window closed"].map(
      (label) => screen.getByText(label),
    );
    expect(labels).toHaveLength(3);
    expect(screen.getByText("Proof needed")).toBeTruthy();
    expect(screen.queryByText("Printing")).toBeNull();
    expect(screen.queryByText(/retention/i)).toBeNull();
  });

  it("opens one row at a time and closes the previous one", async () => {
    await render(<JobBrief order={order()} />);

    expect(screen.getByTestId("job-brief-make")).toBeTruthy();
    expect(screen.getByText("Quantity")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText(/^How it should look,/));
    expect(screen.getByTestId("job-brief-mockup")).toBeTruthy();
    expect(screen.getByText("panel:mockup")).toBeTruthy();
    expect(screen.queryByTestId("job-brief-make")).toBeNull();

    await fireEvent.press(screen.getByLabelText(/^How it should look,/));
    expect(screen.queryByTestId("job-brief-mockup")).toBeNull();
  });

  it("separates the print files from the reference pictures", async () => {
    await render(<JobBrief order={order()} defaultOpen="artwork" />);

    expect(screen.getByText("panel:artwork")).toBeTruthy();
    expect(screen.queryByText("panel:mockup")).toBeNull();
  });

  it("states the ready-by date, the address and the distance", async () => {
    await render(<JobBrief order={order()} defaultOpen="delivery" />);

    expect(screen.getByText("Have it ready by")).toBeTruthy();
    expect(screen.getByText("Bajada, Davao City")).toBeTruthy();
    expect(screen.getByText("3.2 km from your shop")).toBeTruthy();
  });

  it("does not open a row with nothing behind it", async () => {
    await render(<JobBrief order={order({ mockupFileIds: [] })} defaultOpen="mockup" />);

    const row = screen.getByLabelText(/^How it should look,/);
    expect(row.props.accessibilityState).toMatchObject({ disabled: true, expanded: false });
    expect(screen.getByText("None attached — go by the artwork")).toBeTruthy();
    expect(screen.queryByTestId("job-brief-mockup")).toBeNull();
  });

  it("carries the open state to assistive tech", async () => {
    await render(<JobBrief order={order()} />);

    expect(screen.getByLabelText(/^What to make,/).props.accessibilityState).toMatchObject({ expanded: true });
    expect(screen.getByLabelText(/^Artwork,/).props.accessibilityState).toMatchObject({ expanded: false });
  });
});
