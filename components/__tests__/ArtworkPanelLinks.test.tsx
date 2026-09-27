import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { Linking } from "react-native";

import { ArtworkPanel } from "@/components/ArtworkPanel";
import type { Order, ProductionItem } from "@/lib/api";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({ type: "dismiss" })) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFile: jest.fn(() => new Promise(() => undefined)),
  getDownloadUrl: jest.fn(() => new Promise(() => undefined)),
}));

const CANVA = "https://www.canva.com/design/DAG123/TOKEN/view";

function item(partial: Partial<ProductionItem> = {}): ProductionItem {
  return { id: "l1", itemName: "Flyers", quantity: 500, pricingUnit: null, packageQty: null, measurement: null, structuredSpec: {}, options: [], artworkFileId: null, mockupFileId: null, ...partial };
}

function order(items: ProductionItem[], partial: Partial<Order> = {}): Order {
  return {
    id: "ord_1", clientId: "c", supplierId: "s", riderId: null, state: "supplier_assigned", productId: "p", title: "Flyers",
    quantity: 500, size: "A5", material: "gloss", deadline: null, address: "Bajada", zone: "davao", totalMinor: 0, deliveryFeeMinor: 0,
    paymentMethod: null, paymentStatus: "paid", promisedDate: null, artworkName: null, productionItems: items,
    createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z", timeline: [], ...partial,
  };
}

describe("ArtworkPanel design links", () => {
  afterEach(() => jest.restoreAllMocks());

  it("draws a link-only job as its artwork, never as no artwork", async () => {
    await render(<ArtworkPanel order={order([item({ artworkLinks: [{ formatCode: "canva_link", url: CANVA }] })], { artworkName: "flyer.pdf" })} kinds={["artwork"]} />);

    expect(screen.getByText(/sent the design as a link, not an uploaded file/)).toBeTruthy();
    expect(screen.getByText("Canva link")).toBeTruthy();
    expect(screen.getByText("canva.com/design/DAG123/TOKEN/view")).toBeTruthy();
    expect(screen.queryByText(/No print file|no stored file|No artwork/i)).toBeNull();
  });

  it("opens the full link in the browser and copies it", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await render(<ArtworkPanel order={order([item({ artworkLinks: [{ formatCode: "google_drive", url: "https://drive.google.com/file/d/B/view?usp=sharing" }] })])} kinds={["artwork"]} />);

    await fireEvent.press(screen.getByRole("link", { name: /Google Drive link/ }));
    expect(openURL).toHaveBeenCalledWith("https://drive.google.com/file/d/B/view?usp=sharing");

    await fireEvent.press(screen.getByRole("button", { name: "Copy Google Drive link" }));
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("https://drive.google.com/file/d/B/view?usp=sharing");
  });

  it("tells the shop what to do when the phone cannot open the link", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler"));
    await render(<ArtworkPanel order={order([item({ artworkLinks: [{ formatCode: "other_link", url: "https://example.com/art" }] })])} kinds={["artwork"]} />);

    await fireEvent.press(screen.getByRole("link", { name: /Web link/ }));
    await waitFor(() => expect(screen.getByText(/could not open the link. Copy it/)).toBeTruthy());
  });

  it("lists links beside uploaded files, naming each line on a job of several", async () => {
    await render(<ArtworkPanel order={order([
      item({ artworkFileId: "file_1" }),
      item({ id: "l2", itemName: "Banner", artworkLinks: [{ formatCode: "dropbox", url: "https://www.dropbox.com/s/x/banner.pdf" }] }),
    ])} kinds={["artwork"]} />);

    expect(screen.getByText("The client also sent a design link.")).toBeTruthy();
    expect(screen.getByText("Dropbox link")).toBeTruthy();
    expect(screen.getByText("Banner")).toBeTruthy();
  });

  it("keeps links out of the reference-picture row", async () => {
    await render(<ArtworkPanel order={order([item({ artworkLinks: [{ formatCode: "canva_link", url: CANVA }] })])} kinds={["mockup"]} />);
    expect(screen.queryByTestId("design-links")).toBeNull();
  });
});
