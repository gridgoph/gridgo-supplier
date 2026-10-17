import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";

import { JobBrief } from "@/components/JobBrief";
import { getDownloadUrl, type Order, type ProductionItem } from "@/lib/api";

jest.mock("@/components/ArtworkPanel", () => ({ ArtworkPanel: () => null }));

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({ type: "opened" })) }));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getDownloadUrl: jest.fn(async () => ({ url: "https://files.example/cover.pdf" })),
}));

function item(partial: Partial<ProductionItem> = {}): ProductionItem {
  return {
    id: "oli_1",
    itemName: "Thesis binding",
    quantity: 3,
    pricingUnit: null,
    packageQty: null,
    measurement: null,
    structuredSpec: { size: "A4" },
    options: [],
    artworkFileId: "file_thesis",
    mockupFileId: null,
    ...partial,
  };
}

function order(items: ProductionItem[]): Order {
  return {
    id: "ord_1",
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    state: "supplier_assigned",
    productId: "prod_binding",
    title: "Thesis binding",
    quantity: 3,
    size: "A4",
    material: "Hardbound",
    deadline: "2026-10-22T09:00:00+08:00",
    address: "Bajada, Davao City",
    zone: "davao_central",
    supplierPriceMinor: 150000,
    totalMinor: 170000,
    deliveryFeeMinor: 2500,
    deliveryDistanceMeters: 3200,
    readyBy: "2026-10-20T17:00:00+08:00",
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    artworkFileIds: ["file_thesis"],
    mockupFileIds: [],
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z",
    timeline: [],
    productionItems: items,
  };
}

const spine = { institutionCode: "ABC-CS", title: "Flood Risk Mapping of a River Basin", author: "Sample Author", month: 10, year: 2026 };

describe("cover and spine on the job brief", () => {
  beforeEach(() => jest.clearAllMocks());

  it("states the agreed cover and spine, draws the client's preview and opens the cover page", async () => {
    await render(
      <JobBrief
        order={order([item({
          coverSpine: { status: "given", cover: "separate_file", coverFileId: "file_cover", spine, spineDate: "October 2026", spineSummary: "x" },
        })])}
        defaultOpen="make"
      />,
    );

    expect(screen.getByText("Separate cover page")).toBeTruthy();
    expect(screen.getByText("Institution code")).toBeTruthy();
    expect(screen.getAllByText("ABC-CS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Flood Risk Mapping of a River Basin").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sample Author").length).toBeGreaterThan(0);
    expect(screen.getAllByText("October 2026").length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^Preview of the spine, top to bottom: ABC-CS, Flood Risk Mapping/)).toBeTruthy();

    await fireEvent.press(screen.getByText("Open the cover page"));
    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://files.example/cover.pdf"));
    expect(getDownloadUrl).toHaveBeenCalledWith("file_cover");
    await screen.findByText("Open the cover page");
  });

  it("letters a plain cover with the spine details and offers no cover file", async () => {
    await render(
      <JobBrief
        order={order([item({
          coverSpine: { status: "given", cover: "text_only", coverFileId: null, spine: { ...spine, institutionCode: null }, spineDate: "October 2026", spineSummary: "x" },
        })])}
        defaultOpen="make"
      />,
    );

    expect(screen.getByText("Plain cover, text only")).toBeTruthy();
    expect(screen.queryByText("Institution code")).toBeNull();
    expect(screen.queryByText("Open the cover page")).toBeNull();
  });

  it("says Not given when the product asked and the client gave nothing", async () => {
    await render(
      <JobBrief
        order={order([item({
          coverSpine: { status: "not_given", cover: null, coverFileId: null, spine: null, spineDate: null, spineSummary: null },
        })])}
        defaultOpen="make"
      />,
    );

    expect(screen.getByText("Cover and spine")).toBeTruthy();
    expect(screen.getByText("Not given")).toBeTruthy();
    expect(screen.queryByLabelText(/^Preview of the spine/)).toBeNull();
  });

  it("draws nothing new for an order without cover and spine data", async () => {
    await render(<JobBrief order={order([item(), item({ id: "oli_2", coverSpine: null })])} defaultOpen="make" />);

    expect(screen.queryByTestId("cover-spine-spec")).toBeNull();
    expect(screen.queryByText("Cover")).toBeNull();
  });
});
