import { fireEvent, render, screen } from "@testing-library/react-native";

import { JobBrief } from "@/components/JobBrief";
import type { Order } from "@/lib/api";
import { formatDeadlineFull } from "@/lib/dates";

jest.mock("@/components/ArtworkPanel", () => ({
  ArtworkPanel: ({ kinds }: { kinds?: string[] }) => {
    const { Text: T } = jest.requireActual<typeof import("react-native")>("react-native");
    return <T>{`panel:${(kinds ?? []).join(",")}`}</T>;
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFile: jest.fn(async (fileId: string) => ({ fileId, originalFilename: fileId === "file_front" ? "front.pdf" : "logo.jpg" })),
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

  it("states the client's print layout as agreed spec, with GRIDGO's cut-off check in the shop's words", async () => {
    const plans = order({
      title: "Site plan set",
      productionItems: [{
        id: "oli_1",
        itemName: "CAD plotting",
        quantity: 40,
        pricingUnit: null,
        packageQty: null,
        measurement: null,
        structuredSpec: { size: "A1", material: "White paper" },
        options: [],
        artworkFileId: "file_plans",
        mockupFileId: null,
        printLayout: "actual_size_centered",
        printLayoutCheck: {
          layout: "actual_size_centered",
          paper: { label: "24x36 / A1", widthMilli: 594000, heightMilli: 841000, pageSize: "A1" },
          files: [{
            fileId: "file_plans",
            page: { widthMilli: 841000, heightMilli: 1189000, pageSize: "A0", largestShortSideMilli: 841000, largestLongSideMilli: 1189000, mixedPageSizes: false },
            exceedsPaper: true,
          }],
          exceedsPaper: true,
          cutOff: true,
          scaleChanges: false,
          suggestedPaper: null,
          unknown: [],
        },
      }],
    });

    await render(<JobBrief order={plans} defaultOpen="make" />);

    expect(screen.getByText("40 × CAD plotting · A1 · White paper · Actual size, centred (edges cut off)")).toBeTruthy();
    expect(screen.getByText("Print layout")).toBeTruthy();
    expect(screen.getByText("Actual size, centred")).toBeTruthy();
    expect(screen.getByText("24x36 / A1")).toBeTruthy();
    expect(screen.getByText("A0 (841 × 1189 mm)")).toBeTruthy();
    expect(screen.getByText(/^Their page is bigger than 24x36 \/ A1/)).toBeTruthy();
  });

  it("states the client's exact colours with the colours GRIDGO read from each file", async () => {
    const colours = order({
      productionItems: [{
        id: "oli_1",
        itemName: "Club shirts",
        quantity: 30,
        pricingUnit: null,
        packageQty: null,
        measurement: null,
        structuredSpec: { size: "Medium" },
        options: [],
        artworkFileId: "file_front",
        mockupFileId: null,
        artworkAttachments: [{ kind: "file", fileId: "file_front" }, { kind: "file", fileId: "file_logo" }],
        colorTargets: [
          { label: "School maroon", format: "pantone", value: "PANTONE 201 C", cmyk: null, hex: null, swatchHex: "#9D2235", swatchApproximate: true },
          { label: "Crest gold", format: "pantone", value: "PANTONE 7406 C", cmyk: null, hex: null, swatchHex: null, swatchApproximate: null },
          { label: "Logo blue", format: "hex", value: "#1A5FB4", cmyk: null, hex: "#1A5FB4", swatchHex: "#1A5FB4", swatchApproximate: false },
        ],
        artworkColors: [
          {
            fileId: "file_front",
            colors: {
              version: 1,
              status: "partial",
              reasons: ["embedded_images_not_read"],
              colors: [{ kind: "spot", name: "PANTONE 201 C", space: "cmyk", cmyk: { c: 0, m: 100, y: 63, k: 29 }, hex: "#B5003A", uses: 3, shareBps: null }],
            },
          },
          { fileId: "file_logo", colors: { version: 1, status: "unknown", reasons: ["not_read_for_this_file_type"], colors: [] } },
        ],
      }],
    });

    await render(<JobBrief order={colours} defaultOpen="make" />);

    expect(screen.getByText("30 × Club shirts · Medium · 3 exact colours")).toBeTruthy();
    expect(screen.getByText("Exact colours")).toBeTruthy();
    expect(screen.getByText("Client's approximate swatch")).toBeTruthy();
    expect(screen.getByText("Pantone code only, no swatch")).toBeTruthy();
    expect(screen.getByText("Screen colour")).toBeTruthy();
    expect(await screen.findByText("In front.pdf")).toBeTruthy();
    expect(screen.getByText("Spot colour")).toBeTruthy();
    expect(screen.getByText("Pictures placed in the PDF were not read.")).toBeTruthy();
    expect(screen.getByText("logo.jpg")).toBeTruthy();
    expect(screen.getByText("We could not read the colours in this file.")).toBeTruthy();
    expect(screen.getByText(/Work from the codes and values the client named\.$/)).toBeTruthy();
  });

  it("adds nothing to a job whose client named no colours", async () => {
    await render(<JobBrief order={order({ productionItems: [{ id: "oli_1", itemName: "Flyers", quantity: 500, pricingUnit: null, packageQty: null, measurement: null, structuredSpec: {}, options: [], artworkFileId: "file_art", mockupFileId: null, colorTargets: [], artworkColors: [{ fileId: "file_art", colors: { status: "read", reasons: [], colors: [] } }] }] })} defaultOpen="make" />);

    expect(screen.getByText("500 × Flyers")).toBeTruthy();
    expect(screen.queryByTestId("exact-colours")).toBeNull();
  });

  it("adds nothing to a job whose product has no layout choice", async () => {
    await render(<JobBrief order={order()} defaultOpen="make" />);

    expect(screen.queryByText("Print layout")).toBeNull();
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

  it("never states the client's deadline when the shop's own date is missing", async () => {
    const clientDated = order({
      readyBy: null,
      promisedDate: "2026-09-21T09:00:00+08:00",
      jobDetails: { material: "Vinyl", zone: "Nearby", promisedDate: "2026-09-22T09:00:00+08:00", missing: [] },
    });
    const view = await render(<JobBrief order={clientDated} defaultOpen="delivery" />);

    expect(screen.getByText("Have it ready by")).toBeTruthy();
    expect(screen.getByText("Not specified")).toBeTruthy();
    expect(screen.getByText("Date not set yet · Nearby")).toBeTruthy();
    expect(screen.queryByText("Client needs it by")).toBeNull();
    const tree = JSON.stringify(view.toJSON());
    for (const clientDate of ["2026-09-21T09:00:00+08:00", "2026-09-22T09:00:00+08:00"]) {
      expect(tree).not.toContain(formatDeadlineFull(clientDate));
    }
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
