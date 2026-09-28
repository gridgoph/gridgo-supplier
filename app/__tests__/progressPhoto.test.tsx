import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import ProgressPhotoScreen from "@/app/job/[id]/progress-photo";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/apiErrors";
import type { UploadItem } from "@/lib/files";
import { askConfirm } from "@/store/sheets";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: "ord_1" }),
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
  attachProductionPhoto: jest.fn(async () => ({})),
  getDownloadUrl: jest.fn(async (fileId: string) => ({
    fileId,
    url: `https://example.test/${fileId}.jpg`,
    expiresAt: "2099-01-01T00:00:00.000Z",
    expiresInSeconds: 300,
  })),
}));
jest.mock("@/lib/files", () => ({ ...jest.requireActual("@/lib/files"), probeStorage: jest.fn(async () => "available") }));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => true) }));

let mockItems: UploadItem[] = [];
const mockTakePhoto = jest.fn();
const mockMarkAttached = jest.fn();
jest.mock("@/hooks/useFileUpload", () => ({
  useFileUpload: () => ({
    items: mockItems,
    busy: false,
    takePhoto: mockTakePhoto,
    pickImage: jest.fn(),
    markAttached: mockMarkAttached,
    retry: jest.fn(),
    remove: jest.fn(),
  }),
}));

const stored: UploadItem = {
  key: "photo", fileId: "file_new", fileName: "press.jpg", mimeType: "image/jpeg",
  uri: "file:///press.jpg", sizeBytes: 100, stage: "stored", progress: 1, error: null,
};

function job(partial: Partial<api.Order> = {}): api.Order {
  return {
    id: "ord_1", title: "Barangay tarpaulin", state: "production", timeline: [],
    clientId: "client_1", supplierId: "shop", riderId: null, productId: "product_1",
    quantity: 1, size: "3x5", material: "Vinyl", deadline: null,
    address: "Davao City", zone: "Davao", totalMinor: 100000, deliveryFeeMinor: 0,
    paymentMethod: null, paymentStatus: "paid", promisedDate: null, artworkName: null,
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    supplierPriceMinor: 100000, payoutPlanVersion: 2,
    payoutMilestones: [
      { code: "production_started", label: "Start of production", releaseRequires: "shop_proof", sharePercent: 40, amountMinor: 40000, status: "pending_pof", pofFileIds: [], releasedAt: null },
      { code: "delivered", label: "Delivered", releaseRequires: "delivery_proof", sharePercent: 35, amountMinor: 35000, status: "pending_pof", pofFileIds: [], releasedAt: null },
    ],
    productionProgress: { status: "waiting_for_photo", photos: [] },
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockItems = [];
});

it("makes taking a photo the one step, and says an unfiled start proof would do both", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(job());
  const view = await render(<ProgressPhotoScreen />);
  expect(await screen.findByText("Add a production photo")).toBeTruthy();
  expect(screen.getByText("One photo can do both")).toBeTruthy();
  expect(screen.getByText(/releases 40% of your earnings/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Take a photo"));
  expect(mockTakePhoto).toHaveBeenCalled();
  expect(api.attachProductionPhoto).not.toHaveBeenCalled();
  await view.unmount();
});

it("sends a saved photo only after the shop confirms, then offers packing", async () => {
  mockItems = [stored];
  (api.getOrder as jest.Mock)
    .mockResolvedValueOnce(job())
    .mockResolvedValue(job({
      productionProgress: { status: "photos_available", photos: [{ fileId: "file_new", at: "2026-09-28T08:00:00Z" }] },
    }));
  const view = await render(<ProgressPhotoScreen />);
  await fireEvent.press(await screen.findByLabelText("Send to the job"));
  expect(askConfirm).toHaveBeenCalledWith(expect.objectContaining({
    question: "Send this photo to Barangay tarpaulin?",
  }));
  expect(api.attachProductionPhoto).toHaveBeenCalledWith("file_new", "ord_1");
  expect(mockMarkAttached).toHaveBeenCalledWith("photo");
  expect(await screen.findByText("Photo on the job")).toBeTruthy();
  expect(screen.getByLabelText("Package for pickup")).toBeTruthy();
  await view.unmount();
});

it("sends nothing when the shop does not confirm", async () => {
  mockItems = [stored];
  (askConfirm as jest.Mock).mockResolvedValueOnce(false);
  (api.getOrder as jest.Mock).mockResolvedValue(job());
  const view = await render(<ProgressPhotoScreen />);
  await fireEvent.press(await screen.findByLabelText("Send to the job"));
  expect(api.attachProductionPhoto).not.toHaveBeenCalled();
  await view.unmount();
});

it("reloads the job and says it moved on when GRIDGO no longer takes photos", async () => {
  mockItems = [stored];
  (api.attachProductionPhoto as jest.Mock).mockRejectedValueOnce(
    new ApiError(409, { error: "production_photo_upload_not_allowed" }),
  );
  (api.getOrder as jest.Mock)
    .mockResolvedValueOnce(job())
    .mockResolvedValue(job({ state: "ready_for_dispatch" }));
  const view = await render(<ProgressPhotoScreen />);
  await fireEvent.press(await screen.findByLabelText("Send to the job"));
  await waitFor(() => expect(api.getOrder).toHaveBeenCalledTimes(2));
  expect(await screen.findByText(/has moved past production, so it no longer takes progress photos/)).toBeTruthy();
  expect(screen.queryByLabelText("Send to the job")).toBeNull();
  expect(screen.getByText("Back to job")).toBeTruthy();
  await view.unmount();
});

it("shows the start proof photo standing as the production photo, and a finished photo as optional", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(job({
    payoutMilestones: [
      { code: "production_started", label: "Start of production", releaseRequires: "shop_proof", sharePercent: 40, amountMinor: 40000, status: "pof_attached", pofFileIds: ["file_start"], releasedAt: null },
    ],
    productionProgress: { status: "photos_available", photos: [{ fileId: "file_start", at: "2026-09-28T08:00:00Z" }] },
  }));
  const view = await render(<ProgressPhotoScreen />);
  expect(await screen.findByText("Production photos")).toBeTruthy();
  expect(screen.getByText("Also your start-of-production proof")).toBeTruthy();
  expect(screen.getByText(/A proof you filed as a photo counts here too/)).toBeTruthy();
  expect(screen.getByText(/welcome, but not needed/)).toBeTruthy();
  expect(screen.queryByText("One photo can do both")).toBeNull();
  await view.unmount();
});

it("explains why a start proof filed as a PDF does not open packing", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(job({
    payoutMilestones: [
      { code: "production_started", label: "Start of production", releaseRequires: "shop_proof", sharePercent: 40, amountMinor: 40000, status: "pof_attached", pofFileIds: ["file_pdf"], releasedAt: null },
    ],
  }));
  const view = await render(<ProgressPhotoScreen />);
  expect(await screen.findByText("Your start-of-production proof is not a photo")).toBeTruthy();
  await view.unmount();
});
