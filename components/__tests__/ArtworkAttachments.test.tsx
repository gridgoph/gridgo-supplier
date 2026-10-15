import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

import { ArtworkPanel } from "@/components/ArtworkPanel";
import * as api from "@/lib/api";
import type { Order, ProductionItem, StoredFile } from "@/lib/api";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({ type: "dismiss" })) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual<typeof api>("@/lib/api"),
  getFile: jest.fn(),
  getDownloadUrl: jest.fn(),
}));

const getFile = api.getFile as jest.MockedFunction<typeof api.getFile>;
const getDownloadUrl = api.getDownloadUrl as jest.MockedFunction<typeof api.getDownloadUrl>;
const CANVA = "https://www.canva.com/design/DAG1/view";

const FILES: Record<string, [string, string, number]> = {
  front: ["front.png", "image/png", 43_893],
  back: ["back.png", "image/png", 31_546],
  logo: ["logo.pdf", "application/pdf", 795_834],
  flyer: ["flyer.pdf", "application/pdf", 2_400_000],
};

function stored(fileId: string, lineId = "l1"): StoredFile {
  const [name, type, size] = FILES[fileId];
  return {
    fileId, purpose: "artwork", originalFilename: name, declaredContentType: type, detectedContentType: type, size,
    ownerId: "client", state: "ready", createdAt: "today", references: [{ type: "order", id: "ord_1", field: `line:${lineId}:artwork` }],
  } as StoredFile;
}

function item(partial: Partial<ProductionItem> = {}): ProductionItem {
  return { id: "l1", itemName: "T-shirt", quantity: 10, pricingUnit: null, packageQty: null, measurement: null, structuredSpec: {}, options: [], artworkFileId: null, mockupFileId: null, ...partial };
}

function order(items: ProductionItem[]): Order {
  return {
    id: "ord_1", clientId: "c", supplierId: "s", riderId: null, state: "production", productId: "p", title: "T-shirts",
    quantity: 10, size: "M", material: "cotton", deadline: null, address: "Bajada", zone: "davao", totalMinor: 0, deliveryFeeMinor: 0,
    paymentMethod: null, paymentStatus: "paid", promisedDate: null, artworkName: null, productionItems: items,
    createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z", timeline: [],
  };
}

const several = () => item({
  artworkFileId: "front",
  artworkLinks: [{ formatCode: "canva_link", url: CANVA, label: "Logo design" }],
  artworkAttachments: [
    { kind: "file", fileId: "front", label: "Front", downloadUrl: "https://files.test/front-held", downloadUrlExpiresAt: new Date(Date.now() + 240_000).toISOString() },
    { kind: "file", fileId: "back", label: "Back" },
    { kind: "link", formatCode: "canva_link", url: CANVA, label: "Logo design" },
    { kind: "file", fileId: "logo", label: "Logo PDF" },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  getFile.mockImplementation(async (fileId) => stored(fileId));
  getDownloadUrl.mockImplementation(async (fileId) => ({ fileId, url: `https://files.test/${fileId}-fresh`, expiresAt: "", expiresInSeconds: 300 }));
});

describe("several artwork attachments on one item", () => {
  it("lists every file and link in the client's order with its label, name, type and size", async () => {
    await render(<ArtworkPanel order={order([several()])} kinds={["artwork"]} />);
    await waitFor(() => expect(screen.getByText("logo.pdf")).toBeTruthy());

    expect(screen.getByText("Front")).toBeTruthy();
    expect(screen.getByText("front.png")).toBeTruthy();
    expect(screen.getByText("PNG · 43 KB")).toBeTruthy();
    expect(screen.getByText("back.png")).toBeTruthy();
    expect(screen.getByText("Logo design")).toBeTruthy();
    expect(screen.getByText("Canva link")).toBeTruthy();
    expect(screen.getByText("canva.com/design/DAG1/view")).toBeTruthy();
    expect(screen.getByText("Logo PDF")).toBeTruthy();
    expect(screen.getByText("PDF · 777 KB")).toBeTruthy();

    const rows = screen.getAllByRole(/button|link/).map((row) => row.props.accessibilityLabel as string)
      .filter((label) => /^Download|Logo design, Canva link/.test(label));
    expect(rows).toEqual(["Download Front, front.png, main file", "Download Back, back.png", expect.stringMatching(/^Logo design, Canva link/), "Download Logo PDF, logo.pdf"]);
    expect(screen.getAllByTestId("main-file-mark")).toHaveLength(1);
  });

  it("previews the main file from the link the order carried, without asking again", async () => {
    await render(<ArtworkPanel order={order([several()])} kinds={["artwork"]} />);
    const preview = await screen.findByTestId("attachment-preview-image");
    expect(JSON.stringify(preview.props.source)).toContain("https://files.test/front-held");
    expect(getDownloadUrl).not.toHaveBeenCalled();
  });

  it("downloads each file through a fresh link and opens each link at its host", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await render(<ArtworkPanel order={order([several()])} kinds={["artwork"]} />);
    await waitFor(() => expect(screen.getByText("back.png")).toBeTruthy());

    await fireEvent.press(screen.getByRole("button", { name: "Download Back, back.png" }));
    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://files.test/back-fresh"));
    expect(getDownloadUrl).toHaveBeenCalledWith("back");

    await fireEvent.press(screen.getByRole("link", { name: /^Logo design, Canva link/ }));
    expect(openURL).toHaveBeenCalledWith(CANVA);
    openURL.mockRestore();
  });

  it("says when one file will not load and retries just that one", async () => {
    getFile.mockImplementation(async (fileId) => {
      if (fileId === "back") throw new Error("offline");
      return stored(fileId);
    });
    await render(<ArtworkPanel order={order([several()])} kinds={["artwork"]} />);
    await waitFor(() => expect(screen.getByText(/This file could not load/)).toBeTruthy());
    expect(screen.getByText("logo.pdf")).toBeTruthy();

    getFile.mockImplementation(async (fileId) => stored(fileId));
    await fireEvent.press(screen.getByRole("button", { name: "Retry Back" }));
    await waitFor(() => expect(screen.getByText("back.png")).toBeTruthy());
    expect(screen.queryByText(/This file could not load/)).toBeNull();
  });

  it("refuses a file that is not this job's artwork", async () => {
    getFile.mockImplementation(async (fileId) => ({ ...stored(fileId), purpose: fileId === "back" ? "verification_document" : "artwork" }) as StoredFile);
    await render(<ArtworkPanel order={order([several()])} kinds={["artwork"]} />);
    await waitFor(() => expect(screen.getByText(/This file could not load/)).toBeTruthy());
    expect(screen.queryByText("back.png")).toBeNull();
  });

  it("names each item and marks a main file only where there is another file", async () => {
    await render(<ArtworkPanel order={order([several(), item({ id: "l2", itemName: "Tote bag", artworkFileId: "flyer" })])} kinds={["artwork"]} />);
    await waitFor(() => expect(screen.getByText("flyer.pdf")).toBeTruthy());
    expect(screen.getByText("T-shirt")).toBeTruthy();
    expect(screen.getByText("3 files · 1 design link")).toBeTruthy();
    expect(screen.getByText("Tote bag")).toBeTruthy();
    expect(screen.getByText("1 file")).toBeTruthy();
    expect(screen.getAllByTestId("main-file-mark")).toHaveLength(1);
  });

  it("keeps the single print-file card for an older job with one file", async () => {
    getFile.mockImplementation(async (fileId) => stored(fileId));
    await render(<ArtworkPanel order={order([item({ artworkFileId: "flyer" })])} kinds={["artwork"]} />);
    await waitFor(() => expect(screen.getByText("flyer.pdf")).toBeTruthy());
    expect(screen.queryByTestId("artwork-attachments")).toBeNull();
    expect(screen.getByRole("button", { name: "Open flyer.pdf" })).toBeTruthy();
  });
});
