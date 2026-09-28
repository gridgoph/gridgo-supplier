import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import { ArtworkPanel } from "@/components/ArtworkPanel";
import { PayoutQrPlate } from "@/components/PayoutQrPlate";
import { SamplePhoto } from "@/components/SamplePhoto";
import * as api from "@/lib/api";
import type { Order, StoredFile } from "@/lib/api";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({ type: "dismiss" })) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual<typeof api>("@/lib/api"),
  getDownloadUrl: jest.fn(),
  getFile: jest.fn(),
}));

const getDownloadUrl = api.getDownloadUrl as jest.MockedFunction<typeof api.getDownloadUrl>;
const getFile = api.getFile as jest.MockedFunction<typeof api.getFile>;

/**
 * gridgo-supplier#84, across the pictures that hold a signed link: a filed
 * proof drawn from its file id alone, a board sample, the payout QR plate and
 * the client's artwork. An expired link is one fresh read under a sweep; a
 * fresh link that fails still says so.
 */
let now = Date.parse("2026-09-28T02:00:00.000Z");
let resume: ((state: AppStateStatus) => void)[] = [];

/** Each call hands back the next link; `lives` is its life in seconds. */
function links(...lives: number[]) {
  let calls = 0;
  getDownloadUrl.mockImplementation(async (fileId) => {
    const life = lives[Math.min(calls, lives.length - 1)];
    calls += 1;
    return { fileId, url: `https://files.test/${fileId}-${calls}`, expiresAt: "", expiresInSeconds: life };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  getDownloadUrl.mockReset();
  resume = [];
  now = Date.parse("2026-09-28T02:00:00.000Z");
  jest.spyOn(Date, "now").mockImplementation(() => now);
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    resume.push(listener as (state: AppStateStatus) => void);
    return { remove: () => { resume = resume.filter((item) => item !== listener); } } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => jest.restoreAllMocks());

const source = (testID: string) => screen.getByTestId(testID).props.source;
/** expo-image hands its native view an array of sources. */
const artworkSource = () => [source("artwork-preview-image")].flat()[0];
/** expo-image reads `nativeEvent` off its error. */
const refused = () => ({ nativeEvent: { error: "403 Request has expired" } });

describe("a milestone photo that carries only a file id", () => {
  it("shimmers and reads exactly one fresh link when its link has expired", async () => {
    let answer: (value: api.DownloadUrl) => void = () => undefined;
    getDownloadUrl
      .mockResolvedValueOnce({ fileId: "proof_expired", url: "https://files.test/old", expiresAt: "", expiresInSeconds: 300 })
      .mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    const view = await render(<SamplePhoto fileId="proof_expired" altText="Printing evidence" gutter="tight" />);
    await waitFor(() => expect(source("sample-photo-image")).toEqual({ uri: "https://files.test/old" }));

    now += 6 * 60_000;
    await fireEvent(screen.getByTestId("sample-photo-image"), "error");

    // Waiting on the fresh link is the sweep, never the failure.
    expect(screen.getByTestId("sample-photo-loading")).toBeTruthy();
    expect(screen.queryByText("This photo will not load")).toBeNull();

    await act(async () => answer({ fileId: "proof_expired", url: "https://files.test/new", expiresAt: "", expiresInSeconds: 300 }));
    await waitFor(() => expect(source("sample-photo-image")).toEqual({ uri: "https://files.test/new" }));
    expect(getDownloadUrl).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("This photo will not load")).toBeNull();
    await view.unmount();
  });

  it("still says the photo will not load when a fresh link fails", async () => {
    links(300);
    const view = await render(<SamplePhoto fileId="proof_fresh" altText="Printing evidence" />);
    await waitFor(() => expect(screen.getByTestId("sample-photo-image")).toBeTruthy());

    await fireEvent(screen.getByTestId("sample-photo-image"), "error");

    expect(await screen.findByText("This photo will not load")).toBeTruthy();
    expect(getDownloadUrl).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("re-reads its link on returning to the app after five minutes", async () => {
    links(300, 300);
    const view = await render(<SamplePhoto fileId="proof_resume" altText="Printing evidence" />);
    await waitFor(() => expect(source("sample-photo-image")).toEqual({ uri: "https://files.test/proof_resume-1" }));

    now += 5 * 60_000;
    await act(async () => resume.forEach((listener) => listener("active")));

    await waitFor(() => expect(source("sample-photo-image")).toEqual({ uri: "https://files.test/proof_resume-2" }));
    expect(getDownloadUrl).toHaveBeenCalledTimes(2);
    await view.unmount();
  });
});

describe("a board sample", () => {
  it("falls back to its own file link when the board link is refused", async () => {
    links(300);
    const view = await render(
      <SamplePhoto fileId="sample_board" url="https://files.test/board-link" altText="Flyers" />,
    );
    expect(source("sample-photo-image")).toEqual({ uri: "https://files.test/board-link" });

    await fireEvent(screen.getByTestId("sample-photo-image"), "error");

    await waitFor(() => expect(source("sample-photo-image")).toEqual({ uri: "https://files.test/sample_board-1" }));
    expect(screen.queryByText("This photo will not load")).toBeNull();
    await view.unmount();
  });
});

describe("the payout QR plate", () => {
  it("reads one fresh link when its link has expired, and says so when a fresh one fails", async () => {
    links(300, 300);
    const view = await render(<PayoutQrPlate fileId="qr_plate" />);
    await waitFor(() => expect(source("payout-qr-image")).toEqual({ uri: "https://files.test/qr_plate-1" }));

    now += 6 * 60_000;
    await fireEvent(screen.getByTestId("payout-qr-image"), "error");
    await waitFor(() => expect(source("payout-qr-image")).toEqual({ uri: "https://files.test/qr_plate-2" }));
    expect(screen.queryByText("This picture will not load")).toBeNull();

    // The renewed link is good for five minutes: its failure is real.
    await fireEvent(screen.getByTestId("payout-qr-image"), "load");
    await fireEvent(screen.getByTestId("payout-qr-image"), "error");
    expect(await screen.findByText("This picture will not load")).toBeTruthy();
    expect(getDownloadUrl).toHaveBeenCalledTimes(2);
    await view.unmount();
  });
});

describe("the artwork preview", () => {
  const png: StoredFile = {
    fileId: "art_png", purpose: "artwork", originalFilename: "Flyer.png", detectedContentType: "image/png",
    declaredContentType: "image/png", size: 2048, ownerId: "client", state: "ready", createdAt: "today", readyAt: "today",
    references: [{ type: "order", id: "ord_1", field: "artworkFileIds" }],
  };
  const order = {
    id: "ord_1", clientId: "c", supplierId: "s", riderId: null, state: "supplier_assigned", productId: "p", title: "Flyers",
    quantity: 500, size: "A5", material: "gloss", deadline: null, address: "Bajada", zone: "davao", totalMinor: 0,
    deliveryFeeMinor: 0, paymentMethod: null, paymentStatus: "paid", promisedDate: null, artworkName: null,
    artworkFileIds: ["art_png"], productionItems: [], createdAt: "2026-09-27T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z", timeline: [],
  } as unknown as Order;

  it("reads one fresh link instead of latching Preview unavailable", async () => {
    getFile.mockResolvedValue(png);
    links(300, 300);
    const view = await render(<ArtworkPanel order={order} kinds={["artwork"]} />);
    await waitFor(() => expect(artworkSource()).toEqual({ uri: "https://files.test/art_png-1" }));

    now += 6 * 60_000;
    await fireEvent(screen.getByTestId("artwork-preview-image"), "error", refused());

    await waitFor(() => expect(artworkSource()).toEqual({ uri: "https://files.test/art_png-2" }));
    expect(getDownloadUrl).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Preview unavailable")).toBeNull();
    await view.unmount();
  });

  it("still says Preview unavailable when a fresh link fails", async () => {
    getFile.mockResolvedValue({ ...png, fileId: "art_fresh", references: [{ type: "order", id: "ord_1", field: "artworkFileIds" }] });
    links(300);
    const view = await render(<ArtworkPanel order={{ ...order, artworkFileIds: ["art_fresh"] }} kinds={["artwork"]} />);
    await waitFor(() => expect(screen.getByTestId("artwork-preview-image")).toBeTruthy());

    await fireEvent(screen.getByTestId("artwork-preview-image"), "error", refused());

    expect(await screen.findByText("Preview unavailable")).toBeTruthy();
    expect(getDownloadUrl).toHaveBeenCalledTimes(1);
    await view.unmount();
  });
});
