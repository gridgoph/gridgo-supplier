import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import FulfilmentProofScreen from "@/app/job/[id]/fulfilment";
import * as api from "@/lib/api";
import { invalidate } from "@/lib/live";
import type { UploadItem } from "@/lib/files";

let mockParams: { id: string; milestone?: string } = { id: "ord_1" };
jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
  attachFulfilmentProof: jest.fn(),
  getFile: jest.fn(async (fileId: string) => ({
    fileId, originalFilename: `${fileId}.jpg`, detectedContentType: "image/jpeg", declaredContentType: "image/jpeg",
  })),
  getDownloadUrl: jest.fn(async (fileId: string) => ({
    fileId, url: `https://example.test/${fileId}.jpg`, expiresAt: "2099-01-01T00:00:00.000Z", expiresInSeconds: 300,
  })),
}));
jest.mock("@/lib/files", () => ({ ...jest.requireActual("@/lib/files"), probeStorage: jest.fn(async () => "available") }));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => true) }));

function stored(key: string, fileId: string): UploadItem {
  return {
    key, fileId, fileName: `${key}.jpg`, mimeType: "image/jpeg",
    uri: `file:///${key}.jpg`, sizeBytes: 100, stage: "stored", progress: 1, error: null,
  };
}

// The hook's queue, as the screen sees it. `remove` and `noteAttachError`
// change it the way the real hook would, so a re-render shows the result.
let mockItems: UploadItem[] = [];
const mockUpload = {
  remove: jest.fn((key: string) => { mockItems = mockItems.filter((item) => item.key !== key); }),
  noteAttachError: jest.fn((key: string, error: string | null) => {
    mockItems = mockItems.map((item) => (item.key === key ? { ...item, error } : item));
  }),
  takePhoto: jest.fn(),
  pickImages: jest.fn(),
  pickDocuments: jest.fn(),
  retry: jest.fn(),
  markAttached: jest.fn(),
};
jest.mock("@/hooks/useFileUpload", () => ({
  useFileUpload: () => ({ items: mockItems, busy: false, ...mockUpload }),
}));

beforeEach(() => {
  mockParams = { id: "ord_1" };
  mockItems = [stored("photo", "file_1")];
  (api.getOrder as jest.Mock).mockReset();
  (api.attachFulfilmentProof as jest.Mock).mockReset();
  Object.values(mockUpload).forEach((fn) => fn.mockClear());
});

function orderWith(milestones: api.Order["payoutMilestones"], patch: Partial<api.Order> = {}): api.Order {
  return {
    id: "ord_1", title: "Print job", state: "production", timeline: [],
    clientId: "client_1", supplierId: "shop", riderId: null, productId: "product_1",
    quantity: 1, size: "3x5", material: "Vinyl", deadline: null,
    address: "Davao City", zone: "Davao", totalMinor: 100000, deliveryFeeMinor: 0,
    paymentMethod: null, paymentStatus: "paid", promisedDate: null, artworkName: null,
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    supplierPriceMinor: 100000, payoutMilestones: milestones,
    ...patch,
  };
}

type Start = { status?: api.PayoutMilestone["status"]; pofFileIds?: string[] };
const escrowParts = ({ status = "pending_pof", pofFileIds = [] }: Start = {}): api.Order["payoutMilestones"] => [
  { code: "production_started", label: "Start of production", releaseRequires: "shop_proof", sharePercent: 40, amountMinor: 40000, status, pofFileIds, releasedAt: status === "released" ? "2026-10-01T00:00:00Z" : null },
  { code: "delivered", label: "Delivered", releaseRequires: "delivery_proof", sharePercent: 35, amountMinor: 35000, status: "pending_pof", pofFileIds: [], releasedAt: null },
  { code: "issue_window", label: "Issue window closed", releaseRequires: "issue_window_closed", sharePercent: 25, amountMinor: 25000, status: "pending_pof", pofFileIds: [], releasedAt: null },
];
const escrow = (start: Start = {}, patch: Partial<api.Order> = {}) =>
  orderWith(escrowParts(start), { payoutPlanVersion: 2, ...patch });

/** The order GRIDGO answers an attach with: the stage lists what it lists. */
function answered(order: api.Order, pofFileIds: string[]) {
  return {
    file: {},
    order: {
      ...order,
      payoutMilestones: order.payoutMilestones!.map((part) =>
        part.code === "production_started" ? { ...part, status: "pof_attached" as const, pofFileIds } : part,
      ),
    },
  };
}

/** The grid draws once it knows its width. */
async function layOutGrid() {
  const grid = await screen.findByTestId("proof-grid");
  await act(async () => {
    fireEvent(grid, "layout", { nativeEvent: { layout: { width: 320, height: 0, x: 0, y: 0 } } });
  });
}

it("reminds the shop to keep its invoice out of the package on the packaging evidence", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(orderWith([
    { code: "printing", sharePercent: 50, amountMinor: 50000, status: "pof_attached", pofFileIds: ["print"], releasedAt: null },
    { code: "packaging_qc", sharePercent: 15, amountMinor: 15000, status: "pending_pof", pofFileIds: [], releasedAt: null },
  ]));
  const view = await render(<FulfilmentProofScreen />);
  expect(await screen.findByText("Packaging evidence")).toBeTruthy();
  expect(screen.getByText("No invoice or receipt in the package")).toBeTruthy();
  expect(screen.getByText(/Do not put your own invoice or receipt inside the package/)).toBeTruthy();
  expect(screen.getByText(/collects invoices from each shop monthly/)).toBeTruthy();
  await view.unmount();
});

it("leaves the invoice reminder off the printing evidence", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(orderWith([
    { code: "printing", sharePercent: 50, amountMinor: 50000, status: "pending_pof", pofFileIds: [], releasedAt: null },
    { code: "packaging_qc", sharePercent: 15, amountMinor: 15000, status: "pending_pof", pofFileIds: [], releasedAt: null },
  ]));
  const view = await render(<FulfilmentProofScreen />);
  expect(await screen.findByText("Printing evidence")).toBeTruthy();
  expect(screen.queryByText("No invoice or receipt in the package")).toBeNull();
  await view.unmount();
});

it("files a plan-2 start-of-production proof and moves it from the queue to the grid", async () => {
  const job = escrow();
  (api.getOrder as jest.Mock).mockResolvedValue(job);
  (api.attachFulfilmentProof as jest.Mock).mockResolvedValue(answered(job, ["file_1"]));
  const view = await render(<FulfilmentProofScreen />);
  expect(await screen.findByText("Start of production evidence")).toBeTruthy();
  expect(screen.getByText("Photo that production has started")).toBeTruthy();
  expect(screen.getByText(/GRIDGO releases 40% of what you earn on this job — ₱400\.00/)).toBeTruthy();
  expect(screen.queryByText("No invoice or receipt in the package")).toBeNull();
  expect(screen.queryByText(/printing|packaging/i)).toBeNull();
  expect(screen.getAllByTestId("proof-queue-item")).toHaveLength(1);

  await fireEvent.press(screen.getByLabelText("File 1 photo"));
  expect(api.attachFulfilmentProof).toHaveBeenCalledWith("file_1", "ord_1", "production_started");
  expect(await screen.findByText(/1 photo filed\. The GRIDGO Team reviews the evidence/)).toBeTruthy();
  expect(mockUpload.remove).toHaveBeenCalledWith("photo");

  // The next read of the job agrees; the photo is in the grid once and the queue is empty.
  (api.getOrder as jest.Mock).mockResolvedValue(answered(job, ["file_1"]).order);
  await act(async () => { invalidate("orders"); });
  await waitFor(() => expect(api.getOrder).toHaveBeenCalledTimes(2));
  expect(screen.getByText("1 photo on file")).toBeTruthy();
  expect(screen.queryAllByTestId("proof-queue-item")).toHaveLength(0);
  await layOutGrid();
  await waitFor(() => expect(screen.getAllByTestId("proof-tile-image")).toHaveLength(1));
  await view.unmount();
});

it("files several photos, each on its own, and keeps the one GRIDGO refused", async () => {
  mockItems = [stored("one", "file_1"), stored("two", "file_2"), stored("three", "file_3")];
  const job = escrow();
  (api.getOrder as jest.Mock).mockResolvedValue(job);
  (api.attachFulfilmentProof as jest.Mock)
    .mockResolvedValueOnce(answered(job, ["file_1"]))
    .mockRejectedValueOnce(new TypeError("Network request failed"))
    .mockResolvedValueOnce(answered(job, ["file_1", "file_3"]));
  const view = await render(<FulfilmentProofScreen />);
  await fireEvent.press(await screen.findByLabelText("File 3 photos"));

  expect(api.attachFulfilmentProof).toHaveBeenCalledTimes(3);
  expect((api.attachFulfilmentProof as jest.Mock).mock.calls.map((call) => call[0])).toEqual(["file_1", "file_2", "file_3"]);
  expect(await screen.findByText(/2 photos filed/)).toBeTruthy();
  expect(screen.getByText(/Some photos were not filed/)).toBeTruthy();
  expect(mockUpload.remove.mock.calls.map((call) => call[0])).toEqual(["one", "three"]);
  expect(mockUpload.noteAttachError).toHaveBeenCalledWith("two", expect.stringMatching(/\w/));
  // The refused photo is still there to file again, saying why.
  expect(screen.getAllByTestId("proof-queue-item")).toHaveLength(1);
  expect(screen.getByLabelText("File 1 photo")).toBeTruthy();
  await view.unmount();
});

it("says plainly when GRIDGO already had the photo, and lists it once", async () => {
  const job = escrow({ status: "pof_attached", pofFileIds: ["file_old"] });
  (api.getOrder as jest.Mock).mockResolvedValue(job);
  (api.attachFulfilmentProof as jest.Mock).mockResolvedValue(answered(job, ["file_old"]));
  const view = await render(<FulfilmentProofScreen />);
  await fireEvent.press(await screen.findByLabelText("File 1 photo"));
  expect(await screen.findByText("GRIDGO already had these photos for this part.")).toBeTruthy();
  expect(screen.getByText("1 photo on file")).toBeTruthy();
  await layOutGrid();
  await waitFor(() => expect(screen.getAllByTestId("proof-tile-image")).toHaveLength(1));
  await view.unmount();
});

it("stops at the 50-photo limit in plain words", async () => {
  mockItems = [stored("one", "file_1"), stored("two", "file_2")];
  (api.getOrder as jest.Mock).mockResolvedValue(escrow({ status: "pof_attached", pofFileIds: ["file_old"] }));
  (api.attachFulfilmentProof as jest.Mock).mockRejectedValue(
    new api.ApiError(409, { error: "proof_limit_reached", details: { milestoneCode: "production_started", maxProofs: 50 } }),
  );
  const view = await render(<FulfilmentProofScreen />);
  await fireEvent.press(await screen.findByLabelText("File 2 photos"));
  // The second would be refused the same way, so it is not sent.
  expect(api.attachFulfilmentProof).toHaveBeenCalledTimes(1);
  expect(mockUpload.noteAttachError).toHaveBeenCalledWith(
    "one",
    "This part already has 50 photos, the most GRIDGO keeps. Message the GRIDGO Team if they need more.",
  );
  // Said once, on the photo it stopped; not again as a screen-wide failure.
  expect(screen.queryByText(/Some photos were not filed/)).toBeNull();
  expect(screen.queryByText(/proof_limit_reached|409/)).toBeNull();
  // GRIDGO's count is read again; once it shows the part full, nothing is offered to file.
  await waitFor(() => expect(api.getOrder).toHaveBeenCalledTimes(2));
  (api.getOrder as jest.Mock).mockResolvedValue(
    escrow({ status: "pof_attached", pofFileIds: Array.from({ length: 50 }, (_, i) => `file_${i}`) }),
  );
  await act(async () => { invalidate("orders"); });
  expect(await screen.findByText("50 photos on file")).toBeTruthy();
  expect(screen.queryByLabelText(/^File \d/)).toBeNull();
  await view.unmount();
});

it("keeps adding photos to a part that already has its proof", async () => {
  mockItems = [];
  (api.getOrder as jest.Mock).mockResolvedValue(
    escrow({ status: "pof_attached", pofFileIds: ["start_a", "start_b"] }, { state: "ready_for_dispatch" }),
  );
  const view = await render(<FulfilmentProofScreen />);
  expect(await screen.findByText("Start of production evidence")).toBeTruthy();
  expect(screen.getByText("2 photos on file")).toBeTruthy();
  expect(screen.getByText("Add more")).toBeTruthy();
  await fireEvent.press(screen.getByText("Choose photos"));
  expect(mockUpload.pickImages).toHaveBeenCalledWith(48);
  // Nothing waiting to file means no yellow action.
  expect(screen.queryByLabelText(/^File \d/)).toBeNull();
  await layOutGrid();
  await waitFor(() => expect(screen.getAllByTestId("proof-tile-image")).toHaveLength(2));
  await view.unmount();
});

it("still takes photos after the part is released, without promising more money", async () => {
  const job = escrow({ status: "released", pofFileIds: ["start_a"] }, { state: "delivered" });
  (api.getOrder as jest.Mock).mockResolvedValue(job);
  (api.attachFulfilmentProof as jest.Mock).mockResolvedValue({
    file: {},
    order: { ...job, payoutMilestones: job.payoutMilestones!.map((p) => (p.code === "production_started" ? { ...p, pofFileIds: ["start_a", "file_1"] } : p)) },
  });
  const view = await render(<FulfilmentProofScreen />);
  expect(await screen.findByText(/GRIDGO has released this part — ₱400\.00\. You can still add photos/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("File 1 photo"));
  expect(await screen.findByText("1 photo added to this part's evidence.")).toBeTruthy();
  await view.unmount();
});

it("offers no way to add once the part holds 50 photos", async () => {
  mockItems = [];
  const ids = Array.from({ length: 50 }, (_, i) => `file_${i}`);
  (api.getOrder as jest.Mock).mockResolvedValue(escrow({ status: "pof_attached", pofFileIds: ids }));
  const view = await render(<FulfilmentProofScreen />);
  expect(await screen.findByText("50 photos on file")).toBeTruthy();
  expect(screen.getByText(/This part has room for 50 photos and they are all taken/)).toBeTruthy();
  expect(screen.queryByText("Take photo")).toBeNull();
  expect(screen.queryByText("Choose photos")).toBeNull();
  await view.unmount();
});

it("never files the shop's photos against the rider's delivery", async () => {
  mockParams = { id: "ord_1", milestone: "delivered" };
  (api.getOrder as jest.Mock).mockResolvedValue(escrow({ status: "pof_attached", pofFileIds: ["start"] }, { state: "delivered" }));
  (api.attachFulfilmentProof as jest.Mock).mockResolvedValue(answered(escrow(), ["start", "file_1"]));
  const view = await render(<FulfilmentProofScreen />);
  expect(await screen.findByText("Start of production evidence")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("File 1 photo"));
  expect(api.attachFulfilmentProof).toHaveBeenCalledWith("file_1", "ord_1", "production_started");
  await view.unmount();
});

it("offers nothing to file while a refund has stopped the job", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(escrow({ status: "pof_attached", pofFileIds: ["start"] }, { refundHold: true }));
  const view = await render(<FulfilmentProofScreen />);
  expect(await screen.findByText("Nothing to file here")).toBeTruthy();
  expect(screen.queryByLabelText(/^File \d/)).toBeNull();
  await view.unmount();
});

it("says a start photo also opens packing", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(
    escrow({}, { productionProgress: { status: "waiting_for_photo", photos: [] } as unknown as api.Order["productionProgress"] }),
  );
  const view = await render(<FulfilmentProofScreen />);
  expect(await screen.findByText(/A photo also counts as the production photo you need before packing/)).toBeTruthy();
  await view.unmount();
});

it("draws the first twelve photos of a full part and the rest on request", async () => {
  mockItems = [];
  const ids = Array.from({ length: 20 }, (_, i) => `file_${i}`);
  (api.getOrder as jest.Mock).mockResolvedValue(escrow({ status: "pof_attached", pofFileIds: ids }));
  const view = await render(<FulfilmentProofScreen />);
  expect(await screen.findByText("20 photos on file")).toBeTruthy();
  await layOutGrid();
  await waitFor(() => expect(screen.getAllByTestId("proof-tile")).toHaveLength(12));
  await fireEvent.press(screen.getByText("Show all 20 photos"));
  await waitFor(() => expect(screen.getAllByTestId("proof-tile")).toHaveLength(20));
  expect(screen.queryByText("Show all 20 photos")).toBeNull();
  await view.unmount();
});
