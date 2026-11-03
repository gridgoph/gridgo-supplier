import { fireEvent, render, screen } from "@testing-library/react-native";

import HandoffScreen from "@/app/job/[id]/handoff";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/apiErrors";
import type { UploadItem } from "@/lib/files";

/**
 * The shop's receipt scan before a rider is called (gridgo-supplier#64,
 * gridgo-api docs/SHOP_RECEIPT_SCAN_API.md): off by default and invisible,
 * required by GRIDGO's Finance switch and then the step before dispatch.
 */

const SCAN_NEEDED =
  "Scan or upload this order's shop invoice or receipt and attach it before calling a rider. GRIDGO needs the scan before dispatch.";

const mockReload = jest.fn();
const mockRun = jest.fn();
const mockClearError = jest.fn();
const mockReceipt = {
  markAttached: jest.fn(),
  retry: jest.fn(),
  remove: jest.fn(),
  takePhoto: jest.fn(),
  pickImage: jest.fn(),
  pickDocument: jest.fn(),
};
let mockJob: Partial<api.Order>;
let mockReceiptItems: UploadItem[];
let mockActionError: string | null;
let mockFailure: unknown;

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: "job" }),
  useFocusEffect: () => {},
  useNavigation: () => ({ setOptions: jest.fn() }),
}));
jest.mock("@/hooks/useJob", () => ({
  useJob: () => ({ job: mockJob, loading: false, error: null, reload: mockReload }),
}));
jest.mock("@/hooks/useJobAction", () => ({
  useJobAction: () => ({
    busy: false,
    run: mockRun,
    error: mockActionError,
    failure: mockFailure,
    missing: [],
    clearError: mockClearError,
  }),
}));
jest.mock("@/hooks/useFileUpload", () => ({
  useFileUpload: (purpose: string) =>
    purpose === "supplier_invoice"
      ? { items: mockReceiptItems, busy: false, ...mockReceipt }
      : {
          items: [],
          busy: false,
          markAttached: jest.fn(),
          retry: jest.fn(),
          remove: jest.fn(),
          takePhoto: jest.fn(),
          pickImage: jest.fn(),
          pickDocument: jest.fn(),
        },
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  attachReceiptScan: jest.fn(async () => ({})),
  attachPackingPhoto: jest.fn(async () => ({})),
}));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => true) }));
jest.mock("@/components/ProgressPhotoStrip", () => ({ ProgressPhotoStrip: () => null }));
jest.mock("@/components/SamplePhoto", () => ({ SamplePhoto: () => null }));

function readiness(scan: { required: boolean; attached: boolean }) {
  const missing = scan.required && !scan.attached ? [{ code: "receipt_scan_required", message: SCAN_NEEDED }] : [];
  return { ready_for_dispatch: { allowed: missing.length === 0, missing, receiptScan: scan } };
}

function stored(stage: UploadItem["stage"] = "stored", error: string | null = null): UploadItem {
  return {
    key: "scan",
    fileId: stage === "failed" ? null : "scan-file",
    fileName: "receipt.jpg",
    mimeType: "image/jpeg",
    uri: "file:///receipt.jpg",
    sizeBytes: 100,
    stage,
    progress: stage === "failed" ? 0 : 1,
    error,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockJob = {
    id: "job",
    title: "Print job",
    state: "production",
    quantity: 100,
    productionProgress: { status: "photos_available", photos: [{ fileId: "p1", contentType: "image/jpeg" }] },
    packingProgress: { status: "photos_available", photos: [{ fileId: "packed", contentType: "image/jpeg" }] },
    payoutMilestones: [],
    transitionReadiness: readiness({ required: false, attached: false }),
  };
  mockReceiptItems = [];
  mockActionError = null;
  mockFailure = null;
});

it("changes nothing while GRIDGO's switch is off", async () => {
  const view = await render(<HandoffScreen />);
  expect(screen.getByLabelText("Ready for dispatch")).toBeTruthy();
  expect(screen.queryByTestId("receipt-scan-card")).toBeNull();
  expect(screen.queryByLabelText("Scan the receipt")).toBeNull();
  await view.unmount();
});

it("holds Ready for dispatch with a plain reason until the scan is attached", async () => {
  mockJob.transitionReadiness = readiness({ required: true, attached: false });
  const view = await render(<HandoffScreen />);
  expect(screen.getByText("Receipt scan needed")).toBeTruthy();
  expect(screen.getByText(SCAN_NEEDED)).toBeTruthy();
  expect(screen.getByText("Ready for dispatch opens once the scan is attached.")).toBeTruthy();
  expect(screen.queryByLabelText("Ready for dispatch")).toBeNull();

  await fireEvent.press(screen.getByLabelText("Scan the receipt"));
  expect(mockReceipt.takePhoto).toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Upload a photo or PDF"));
  expect(mockReceipt.pickDocument).toHaveBeenCalled();
  expect(mockRun).not.toHaveBeenCalled();
  await view.unmount();
});

it("attaches a stored scan to the job, then reads the job again", async () => {
  mockJob.transitionReadiness = readiness({ required: true, attached: false });
  mockReceiptItems = [stored()];
  const view = await render(<HandoffScreen />);
  await fireEvent.press(screen.getByLabelText("Attach receipt scan"));
  expect(api.attachReceiptScan).toHaveBeenCalledWith("scan-file", "job");
  expect(mockReceipt.markAttached).toHaveBeenCalledWith("scan");
  expect(mockClearError).toHaveBeenCalled();
  expect(mockReload).toHaveBeenCalled();
  expect(mockRun).not.toHaveBeenCalled();
  await view.unmount();
});

it("confirms an attached scan, offers dispatch, and lets the shop replace it", async () => {
  mockJob.transitionReadiness = readiness({ required: true, attached: true });
  const view = await render(<HandoffScreen />);
  expect(screen.getByText("Receipt scan attached")).toBeTruthy();
  expect(screen.getByLabelText("Ready for dispatch")).toBeTruthy();

  await fireEvent.press(screen.getByText("Replace scan"));
  expect(screen.getByLabelText("Scan the receipt")).toBeTruthy();
  expect(screen.queryByLabelText("Ready for dispatch")).toBeNull();
  await fireEvent.press(screen.getByLabelText("Keep the current scan"));
  expect(screen.getByLabelText("Ready for dispatch")).toBeTruthy();
  await view.unmount();
});

it("turns GRIDGO's refusal into the scan step, said once in its own words", async () => {
  // Read before the switch went on: the job still offers dispatch, and GRIDGO refuses it.
  mockActionError = SCAN_NEEDED;
  mockFailure = new ApiError(409, {
    error: "receipt_scan_required",
    message: SCAN_NEEDED,
    missing: [{ code: "receipt_scan_required", message: SCAN_NEEDED }],
  });
  const view = await render(<HandoffScreen />);
  expect(screen.getAllByText(SCAN_NEEDED)).toHaveLength(1);
  expect(screen.getByLabelText("Scan the receipt")).toBeTruthy();
  expect(screen.queryByLabelText("Ready for dispatch")).toBeNull();
  expect(screen.queryByText(/Cannot reach GRIDGO/)).toBeNull();
  await view.unmount();
});

it("keeps a failed upload on screen with its reason and a retry", async () => {
  mockJob.transitionReadiness = readiness({ required: true, attached: false });
  const reason = "This file is 20.0 MB and the limit is 15 MB. Export it smaller and send it again.";
  mockReceiptItems = [stored("failed", reason)];
  const view = await render(<HandoffScreen />);
  expect(screen.getByText(reason)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Send receipt.jpg again"));
  expect(mockReceipt.retry).toHaveBeenCalledWith("scan");
  // Nothing stored, so the footer still offers a new scan rather than an attach.
  expect(screen.getByLabelText("Scan the receipt")).toBeTruthy();
  expect(screen.queryByLabelText("Attach receipt scan")).toBeNull();
  await view.unmount();
});

it("says plainly when the scan could not be attached offline, and keeps it to try again", async () => {
  mockJob.transitionReadiness = readiness({ required: true, attached: false });
  mockReceiptItems = [stored()];
  (api.attachReceiptScan as jest.Mock).mockRejectedValueOnce(new TypeError("Network request failed"));
  const view = await render(<HandoffScreen />);
  await fireEvent.press(screen.getByLabelText("Attach receipt scan"));
  expect(screen.getByText(/Cannot reach GRIDGO to attach this receipt scan/)).toBeTruthy();
  expect(mockReceipt.markAttached).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Attach receipt scan")).toBeTruthy();
  await view.unmount();
});

it("asks for the scan on the newer handover before Ready for rider pickup", async () => {
  mockJob = {
    ...mockJob,
    supplierId: "shop",
    state: "supplier_self_qc",
    handoverFlow: "rider_packs",
    shopHandover: {
      finished: { at: "2026-10-15T02:00:00.000Z", supplierId: "shop", photoFileIds: ["f1"] },
      review: { at: "2026-10-15T03:00:00.000Z", decision: "approved", note: "" },
    },
    transitionReadiness: readiness({ required: true, attached: false }),
  };
  const view = await render(<HandoffScreen />);
  expect(screen.getByText("Ready for rider pickup opens once the scan is attached.")).toBeTruthy();
  // The scan card says it; the checklist is not drawn for a scan alone.
  expect(screen.queryByTestId("packaging-checklist")).toBeNull();
  expect(screen.queryByLabelText("Ready for rider pickup")).toBeNull();
  await view.unmount();
});

describe("the job's checklist row", () => {
  // Imported here so the screen's mocks above stay the only ones in play.
  const { PackagingChecklist } = jest.requireActual("@/components/PackagingChecklist");
  const { packagingCheck } = jest.requireActual("@/lib/packagingReadiness");

  it("stays optional while the switch is off", async () => {
    const check = packagingCheck({ state: "production", transitionReadiness: readiness({ required: false, attached: false }) });
    const view = await render(<PackagingChecklist check={check} onMessageOperations={jest.fn()} />);
    expect(screen.getByLabelText(/Receipt scan, Optional/)).toBeTruthy();
    await view.unmount();
  });

  it("reads Needed with GRIDGO's sentence, then Done once attached", async () => {
    let check = packagingCheck({ state: "production", transitionReadiness: readiness({ required: true, attached: false }) });
    const view = await render(<PackagingChecklist check={check} onMessageOperations={jest.fn()} />);
    expect(screen.getByLabelText(`Receipt scan, Needed. ${SCAN_NEEDED}`)).toBeTruthy();
    // A scan is the shop's own step: no way to Operations is offered for it.
    expect(screen.queryByText("Message Operations")).toBeNull();
    check = packagingCheck({ state: "production", transitionReadiness: readiness({ required: true, attached: true }) });
    await view.rerender(<PackagingChecklist check={check} onMessageOperations={jest.fn()} />);
    expect(screen.getByLabelText("Receipt scan, Done. On the job. Operations can see it.")).toBeTruthy();
    await view.unmount();
  });
});
