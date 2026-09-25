import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import FulfilmentProofScreen from "@/app/job/[id]/fulfilment";
import * as api from "@/lib/api";
import { invalidate } from "@/lib/live";
import type { UploadItem } from "@/lib/files";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ id: "ord_1" }),
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"), getOrder: jest.fn(), attachFulfilmentProof: jest.fn(async () => ({})),
}));
jest.mock("@/lib/files", () => ({ ...jest.requireActual("@/lib/files"), probeStorage: jest.fn(async () => "available") }));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => true) }));
const mockFile: UploadItem = {
  key: "photo", fileId: "file_1", fileName: "packing.jpg", mimeType: "image/jpeg",
  uri: "file:///packing.jpg", sizeBytes: 100, stage: "stored", progress: 1, error: null,
};
jest.mock("@/hooks/useFileUpload", () => ({
  useFileUpload: () => ({ items: [mockFile], busy: false, markAttached: jest.fn(), retry: jest.fn(), remove: jest.fn() }),
}));

beforeEach(() => { (api.getOrder as jest.Mock).mockClear(); });

function orderWith(milestones: api.Order["payoutMilestones"]): api.Order {
  return {
    id: "ord_1", title: "Print job", state: "production", timeline: [],
    clientId: "client_1", supplierId: "shop", riderId: null, productId: "product_1",
    quantity: 1, size: "3x5", material: "Vinyl", deadline: null,
    address: "Davao City", zone: "Davao", totalMinor: 100000, deliveryFeeMinor: 0,
    paymentMethod: null, paymentStatus: "paid", promisedDate: null, artworkName: null,
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    supplierPriceMinor: 100000, payoutMilestones: milestones,
  };
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

it("keeps the filed milestone and photo when no shop proof remains", async () => {
  const job: api.Order = {
    id: "ord_1", title: "Print job", state: "ready_for_dispatch", timeline: [],
    clientId: "client_1", supplierId: "shop", riderId: null, productId: "product_1",
    quantity: 1, size: "3x5", material: "Vinyl", deadline: null,
    address: "Davao City", zone: "Davao", totalMinor: 100000, deliveryFeeMinor: 0,
    paymentMethod: null, paymentStatus: "paid", promisedDate: null, artworkName: null,
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    supplierPriceMinor: 100000,
    payoutMilestones: [
      { code: "printing", sharePercent: 50, amountMinor: 50000, status: "pof_attached", pofFileIds: ["print"], releasedAt: null },
      { code: "packaging_qc", sharePercent: 15, amountMinor: 15000, status: "pending_pof", pofFileIds: [], releasedAt: null },
    ],
  };
  (api.getOrder as jest.Mock).mockResolvedValue(job);
  const view = await render(<FulfilmentProofScreen />);
  await fireEvent.press(await screen.findByLabelText("File this evidence"));
  expect(await screen.findByText("Evidence filed")).toBeTruthy();
  expect(api.attachFulfilmentProof).toHaveBeenCalledWith("file_1", "ord_1", "packaging_qc");
  (api.getOrder as jest.Mock).mockResolvedValue({
    ...job, payoutMilestones: job.payoutMilestones!.map((part) => ({ ...part, status: "pof_attached", pofFileIds: ["file_1"] })),
  });
  await act(async () => { invalidate("orders"); });
  await waitFor(() => expect(api.getOrder).toHaveBeenCalledTimes(2));
  expect(screen.getByText("Evidence filed")).toBeTruthy();
  expect(screen.getByLabelText("packing.jpg").props.source).toEqual({ uri: "file:///packing.jpg" });
  await view.unmount();
});

const escrowParts = (start: "pending_pof" | "pof_attached" = "pending_pof"): api.Order["payoutMilestones"] => [
  { code: "production_started", label: "Start of production", releaseRequires: "shop_proof", sharePercent: 40, amountMinor: 40000, status: start, pofFileIds: start === "pending_pof" ? [] : ["start"], releasedAt: null },
  { code: "delivered", label: "Delivered", releaseRequires: "delivery_proof", sharePercent: 35, amountMinor: 35000, status: "pending_pof", pofFileIds: [], releasedAt: null },
  { code: "issue_window", label: "Issue window closed", releaseRequires: "issue_window_closed", sharePercent: 25, amountMinor: 25000, status: "pending_pof", pofFileIds: [], releasedAt: null },
];

it("files a plan-2 start-of-production proof against production_started", async () => {
  (api.attachFulfilmentProof as jest.Mock).mockClear();
  (api.getOrder as jest.Mock).mockResolvedValue({ ...orderWith(escrowParts()), payoutPlanVersion: 2 });
  const view = await render(<FulfilmentProofScreen />);
  expect(await screen.findByText("Start of production evidence")).toBeTruthy();
  expect(screen.getByText("Photo that production has started")).toBeTruthy();
  expect(screen.getByText(/GRIDGO releases 40% of what you earn on this job — ₱400\.00/)).toBeTruthy();
  // No packing evidence on the escrow plan, so no packing reminder here either.
  expect(screen.queryByText("No invoice or receipt in the package")).toBeNull();
  expect(screen.queryByText(/printing|packaging/i)).toBeNull();

  await fireEvent.press(screen.getByLabelText("File this evidence"));
  expect(await screen.findByText("Evidence filed")).toBeTruthy();
  expect(api.attachFulfilmentProof).toHaveBeenCalledWith("file_1", "ord_1", "production_started");
  await view.unmount();
});

it("offers nothing to file on a plan-2 job once the start is filed", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue({
    ...orderWith(escrowParts("pof_attached")), state: "ready_for_dispatch", payoutPlanVersion: 2,
  });
  const view = await render(<FulfilmentProofScreen />);
  expect(await screen.findByText("Nothing to file here")).toBeTruthy();
  expect(screen.queryByLabelText("File this evidence")).toBeNull();
  await view.unmount();
});
