import { fireEvent, render, screen } from "@testing-library/react-native";

import FinishedProductsScreen from "@/app/job/[id]/finished";
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
  attachFinishedProductPhoto: jest.fn(async () => ({})),
  submitFinishedProducts: jest.fn(async () => ({})),
}));
jest.mock("@/lib/files", () => ({ ...jest.requireActual("@/lib/files"), probeStorage: jest.fn(async () => "available") }));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => true) }));

let mockItems: UploadItem[] = [];
const mockTakePhoto = jest.fn();
const mockMarkAttached = jest.fn();
let mockPurpose: string | null = null;
jest.mock("@/hooks/useFileUpload", () => ({
  useFileUpload: (purpose: string) => {
    mockPurpose = purpose;
    return {
      items: mockItems,
      busy: false,
      takePhoto: mockTakePhoto,
      pickImage: jest.fn(),
      markAttached: mockMarkAttached,
      retry: jest.fn(),
      remove: jest.fn(),
    };
  },
}));

const stored = (key: string, fileId: string): UploadItem => ({
  key, fileId, fileName: `${key}.jpg`, mimeType: "image/jpeg",
  uri: `file:///${key}.jpg`, sizeBytes: 100, stage: "stored", progress: 1, error: null,
});

const SENT = { at: "2026-10-15T02:00:00.000Z", supplierId: "shop", photoFileIds: ["f1"] };

function job(partial: Partial<api.Order> = {}): api.Order {
  return {
    id: "ord_1", title: "Barangay flyers", state: "production", timeline: [],
    clientId: "client_1", supplierId: "shop", riderId: null, productId: "product_1",
    quantity: 100, size: "A5", material: "Gloss", deadline: null,
    address: "Davao City", zone: "Davao", totalMinor: 100000, deliveryFeeMinor: 0,
    paymentMethod: null, paymentStatus: "paid", promisedDate: null, artworkName: null,
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    payoutPlanVersion: 2, handoverFlow: "rider_packs", shopHandover: {},
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockItems = [];
});

it("photographs the finished products under their own purpose and says not to pack", async () => {
  (api.getOrder as jest.Mock).mockResolvedValue(job());
  const view = await render(<FinishedProductsScreen />);
  expect(await screen.findByText("Finished products")).toBeTruthy();
  expect(screen.getByText(/Do not pack yet; the rider checks the unpacked items first/)).toBeTruthy();
  expect(mockPurpose).toBe("finished_product_photo");
  await fireEvent.press(screen.getByLabelText("Take a photo"));
  expect(mockTakePhoto).toHaveBeenCalled();
  expect(api.submitFinishedProducts).not.toHaveBeenCalled();
  await view.unmount();
});

it("confirms, attaches every photo, then asks GRIDGO to review them", async () => {
  mockItems = [stored("a", "file_a"), stored("b", "file_b")];
  (api.getOrder as jest.Mock)
    .mockResolvedValueOnce(job())
    .mockResolvedValue(job({ state: "supplier_self_qc", shopHandover: { finished: SENT, review: null } }));
  const view = await render(<FinishedProductsScreen />);
  await fireEvent.press(await screen.findByLabelText("Send 2 photos for review"));
  expect(askConfirm).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: "Send for review" }));
  expect(api.attachFinishedProductPhoto).toHaveBeenNthCalledWith(1, "file_a", "ord_1");
  expect(api.attachFinishedProductPhoto).toHaveBeenNthCalledWith(2, "file_b", "ord_1");
  expect(api.submitFinishedProducts).toHaveBeenCalledWith("ord_1");
  expect(await screen.findByText("Sent for review")).toBeTruthy();
  expect(screen.getByText(/production time is paused/)).toBeTruthy();
  await view.unmount();
});

it("sends nothing when the shop says not yet", async () => {
  (askConfirm as jest.Mock).mockResolvedValueOnce(false);
  mockItems = [stored("a", "file_a")];
  (api.getOrder as jest.Mock).mockResolvedValue(job());
  const view = await render(<FinishedProductsScreen />);
  await fireEvent.press(await screen.findByLabelText("Send for review"));
  expect(api.attachFinishedProductPhoto).not.toHaveBeenCalled();
  expect(api.submitFinishedProducts).not.toHaveBeenCalled();
  await view.unmount();
});

it("says GRIDGO's note first after a review it sent back", async () => {
  const rejected = { at: "2026-10-15T03:00:00.000Z", decision: "rejected", note: "Reprint the two smudged copies" };
  (api.getOrder as jest.Mock).mockResolvedValue(
    job({ shopHandover: { finished: null, review: rejected, attempts: [{ finished: SENT, review: rejected }] } }),
  );
  const view = await render(<FinishedProductsScreen />);
  expect(await screen.findByText("Send new finished photos")).toBeTruthy();
  expect(screen.getByText("GRIDGO asked for a fix")).toBeTruthy();
  expect(screen.getByText("“Reprint the two smudged copies”")).toBeTruthy();
  await view.unmount();
});

it("shows a refusal in GRIDGO's words and keeps the photos ready to send again", async () => {
  mockItems = [stored("a", "file_a")];
  (api.getOrder as jest.Mock).mockResolvedValue(job());
  (api.submitFinishedProducts as jest.Mock).mockRejectedValueOnce(
    new ApiError(409, { error: "finished_product_photo_required" }),
  );
  const view = await render(<FinishedProductsScreen />);
  await fireEvent.press(await screen.findByLabelText("Send for review"));
  expect(api.attachFinishedProductPhoto).toHaveBeenCalledWith("file_a", "ord_1");
  expect(await screen.findByText(/Photos GRIDGO already reviewed cannot be sent again/)).toBeTruthy();
  expect(screen.queryByText(/finished_product_photo_required/)).toBeNull();
  await view.unmount();
});
