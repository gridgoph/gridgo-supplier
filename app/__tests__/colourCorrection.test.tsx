import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import ColourCorrectionScreen from "@/app/job/[id]/colour";
import JobWorkspaceScreen from "@/app/job/[id]/index";
import type { Order } from "@/lib/api";
import { getOrder, requestOrderChange } from "@/lib/api";
import { ApiError } from "@/lib/apiErrors";
import { askConfirm } from "@/store/sheets";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: "ord_1" }),
  useNavigation: () => ({ setOptions: jest.fn() }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/store/sheets", () => ({
  askConfirm: jest.fn(async () => true),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
  transitionOrder: jest.fn(),
  requestOrderChange: jest.fn(async () => ({})),
  getMyProductionLapses: jest.fn(async () => ({ lapses: [] })),
}));


const EVIDENCE = {
  version: 1,
  status: "priced",
  pricedByColour: true,
  estimate: true,
  quantityMode: "document_sets",
  quantity: 3,
  totalSheets: 6,
  paperSize: "20x30",
  tierSet: "large_format",
  lineSubtotalMinor: 27000,
  warning: null,
  request: { thresholds: { a3MonochromeMaxBps: 1000 } },
  pages: [
    { fileId: "file_pdf", page: 1, strongColourBps: 0, tier: "none", sheetPriceMinor: 3000, status: "priced" },
    { fileId: "file_pdf", page: 2, strongColourBps: 1800, tier: "up_to_25", sheetPriceMinor: 6000, status: "priced" },
  ],
};

function job(partial: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "client_1",
    supplierId: "shop_1",
    riderId: null,
    state: "production",
    productId: "product_1",
    title: "Seminar handouts",
    quantity: 1,
    size: "A4",
    material: "Bond",
    deadline: null,
    readyBy: "2099-08-12T08:00:00+08:00",
    address: "Davao City",
    zone: "davao_central",
    totalMinor: 0,
    deliveryFeeMinor: 0,
    paymentMethod: null,
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-10-15T00:00:00Z",
    updatedAt: "2026-10-15T00:00:00Z",
    supplierPriceMinor: 400000,
    payoutMilestones: [],
    timeline: [],
    productionItems: [
      {
        id: "line_1",
        itemName: "Site plans",
        quantity: 1,
        pricingUnit: "per_page",
        packageQty: null,
        measurement: { pages: 1200 },
        structuredSpec: {},
        options: [],
        artworkFileId: null,
        mockupFileId: null,
        colourPricing: EVIDENCE,
      },
    ],
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("colour pricing on a job", () => {
  it("shows each page's strong colour, tier and the shop's own sheet price, and offers a correction", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    const view = await render(<JobWorkspaceScreen />);

    expect(await screen.findByTestId("colour-pricing-spec")).toBeTruthy();
    expect(screen.getByText("20x30, priced by strong colour")).toBeTruthy();
    expect(screen.getByText("3 sets × 2 pages = 6 sheets")).toBeTruthy();
    expect(screen.getByLabelText("Page 2, 18% strong colour, Up to 25%, ₱60.00")).toBeTruthy();
    expect(screen.getByLabelText("Page 1, 0% strong colour, No strong colour, ₱30.00")).toBeTruthy();
    expect(screen.getByText("₱270.00")).toBeTruthy();
    expect(screen.getByText("Correct the colour price")).toBeTruthy();
    await view.unmount();
  });

  it("says a page the shop never priced needs a price check", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({
        productionItems: [
          {
            ...job().productionItems![0],
            colourPricing: {
              ...EVIDENCE,
              status: "needs_price_check",
              lineSubtotalMinor: null,
              pages: [{ ...EVIDENCE.pages[1], page: 1, strongColourBps: 6000, tier: "above_50", sheetPriceMinor: null }],
            },
          },
        ],
      }),
    );
    const view = await render(<JobWorkspaceScreen />);
    expect(await screen.findByLabelText("Page 1, 60% strong colour, Above 50%, Needs a price check")).toBeTruthy();
    expect(screen.getByText("Needs a price check")).toBeTruthy();
    await view.unmount();
  });

  it("shows the client's colour warning on a one-colour service, without prices", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({
        productionItems: [
          {
            ...job().productionItems![0],
            colourPricing: {
              ...EVIDENCE,
              status: "fixed_price",
              pricedByColour: false,
              warning:
                "Your file has colour, but this service prints in one colour. Choose a colour service if you need the colours.",
              pages: EVIDENCE.pages.map((page) => ({ ...page, tier: null, sheetPriceMinor: null })),
            },
          },
        ],
      }),
    );
    const view = await render(<JobWorkspaceScreen />);
    expect(await screen.findByText("One colour service, fixed price")).toBeTruthy();
    expect(
      screen.getByText(
        "The client was told: “Your file has colour, but this service prints in one colour. Choose a colour service if you need the colours.”",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Correct the colour price")).toBeNull();
    await view.unmount();
  });

  it("shows a sent correction's pages beside what GRIDGO measured", async () => {
    (getOrder as jest.Mock).mockResolvedValue(
      job({
        changeRequests: [
          {
            id: "change_1",
            lineItemId: "line_1",
            status: "pending",
            version: 1,
            extraPrincipalMinor: 9000,
            reason: "Orange fill on page 1.",
            proposedSpec: "",
            colourCorrection: {
              version: 1,
              quantity: 3,
              originalLineSubtotalMinor: 27000,
              correctedLineSubtotalMinor: 36000,
              pages: [
                { fileId: "file_pdf", page: 1, strongColourBps: 1800, tier: "up_to_25", sheetPriceMinor: 6000 },
                { fileId: "file_pdf", page: 2, strongColourBps: 1800, tier: "up_to_25", sheetPriceMinor: 6000 },
              ],
            },
          },
        ],
      }),
    );
    const view = await render(<JobWorkspaceScreen />);
    expect(await screen.findByText("Your corrected colour pages")).toBeTruthy();
    expect(screen.getByText("Page 1: 18% strong colour, Up to 25%, ₱60.00 a sheet")).toBeTruthy();
    expect(screen.getByText("GRIDGO measured 0%, ₱30.00 a sheet")).toBeTruthy();
    expect(screen.getByText("1 other page keeps GRIDGO's reading and price.")).toBeTruthy();
    // One request at a time.
    expect(screen.queryByText("Correct the colour price")).toBeNull();
    await view.unmount();
  });
});

describe("correcting the colour price", () => {
  it("sends every page with the corrected reading and the shop's rate, never an extra of its own", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    const view = await render(<ColourCorrectionScreen />);

    expect(await screen.findByText("Site plans on 20x30: 3 sets × 2 pages = 6 sheets.")).toBeTruthy();
    expect(screen.getByText("GRIDGO measured 0%, ₱30.00 a sheet")).toBeTruthy();
    // A reading moved into another tier takes the shop's own rate for it.
    await fireEvent.changeText(screen.getByLabelText("Page 1 strong colour percent"), "18");
    expect(screen.getByLabelText("Page 1 your price a sheet").props.value).toBe("60.00");
    expect(screen.getByText("₱90.00")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("What you saw at print size"), "Orange fill across the title block.");
    await fireEvent.press(screen.getByText("Send correction"));

    await waitFor(() => expect(requestOrderChange).toHaveBeenCalledTimes(1));
    expect(askConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ question: "Send this colour correction for ₱90.00 extra?" }),
    );
    expect(requestOrderChange).toHaveBeenCalledWith(
      "ord_1",
      {
        lineItemId: "line_1",
        reason: "Orange fill across the title block.",
        colourCorrection: {
          pages: [
            { fileId: "file_pdf", page: 1, strongColourBps: 1800, sheetPriceMinor: 6000 },
            { fileId: "file_pdf", page: 2, strongColourBps: 1800, sheetPriceMinor: 6000 },
          ],
        },
      },
      expect.stringMatching(/^colour-/),
    );
    await view.unmount();
  });

  it("sends nothing unchanged, and sends a lower price to the GRIDGO Team as a refund", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    const view = await render(<ColourCorrectionScreen />);

    await fireEvent.changeText(await screen.findByLabelText("What you saw at print size"), "Checked at size.");
    await fireEvent.press(screen.getByText("Send correction"));
    expect(await screen.findByText("Change the reading or price of at least one page.")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Page 2 strong colour percent"), "0");
    expect(screen.getByLabelText("Page 2 your price a sheet").props.value).toBe("30.00");
    await fireEvent.press(screen.getByText("Send correction"));
    expect(await screen.findByText(/A lower price is a refund/)).toBeTruthy();
    expect(requestOrderChange).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("starts a second correction from the one the client agreed to, and says a lower total at once", async () => {
    const agreed = {
      id: "change_1",
      appliedAt: "2026-10-16T09:00:00Z",
      version: 1,
      quantity: 3,
      totalSheets: 6,
      quantityMode: "document_sets",
      originalLineSubtotalMinor: 27000,
      correctedLineSubtotalMinor: 36000,
      pages: [
        { fileId: "file_pdf", page: 1, strongColourBps: 1800, tier: "up_to_25", sheetPriceMinor: 6000 },
        { fileId: "file_pdf", page: 2, strongColourBps: 1800, tier: "up_to_25", sheetPriceMinor: 6000 },
      ],
    };
    (getOrder as jest.Mock).mockResolvedValue(
      job({
        productionItems: job().productionItems!.map((item) => ({ ...item, agreedColourCorrection: agreed })),
      }),
    );
    const view = await render(<ColourCorrectionScreen />);

    expect((await screen.findByLabelText("Page 1 strong colour percent")).props.value).toBe("18");
    expect(screen.getByLabelText("Page 1 your price a sheet").props.value).toBe("60.00");
    expect(screen.getByText("GRIDGO measured 0%, ₱30.00 a sheet")).toBeTruthy();
    expect(screen.getAllByText("₱360.00")).toHaveLength(2);
    expect(screen.queryByText(/A lower price is a refund/)).toBeNull();

    await fireEvent.changeText(screen.getByLabelText("Page 1 your price a sheet"), "50");
    expect(screen.getByText(/A lower price is a refund/)).toBeTruthy();
    expect(screen.queryByText(/₱-/)).toBeNull();

    await fireEvent.changeText(screen.getByLabelText("Page 1 your price a sheet"), "60");
    await fireEvent.changeText(screen.getByLabelText("Page 2 your price a sheet"), "80");
    expect(screen.getByText("₱60.00")).toBeTruthy();
    await view.unmount();
  });

  it("says why GRIDGO refused, in the shop's words", async () => {
    (getOrder as jest.Mock).mockResolvedValue(job());
    (requestOrderChange as jest.Mock).mockRejectedValueOnce(
      new ApiError(409, { error: "colour_correction_refund_required" }),
    );
    const view = await render(<ColourCorrectionScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Page 2 your price a sheet"), "80");
    await fireEvent.changeText(screen.getByLabelText("What you saw at print size"), "Heavy red.");
    await fireEvent.press(screen.getByText("Send correction"));
    expect(await screen.findByText(/contact the GRIDGO Team, who refund the client through Operations/)).toBeTruthy();
    await view.unmount();
  });
});
