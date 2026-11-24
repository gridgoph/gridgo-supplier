import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import type { HomePrinterRead, HomeStatus } from "@/lib/homePrinter";

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    useFocusEffect: (effect: () => void) => useEffect(() => effect(), [effect]),
  };
});
jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: () => undefined }));
jest.mock("@/store/sheets", () => ({
  askConfirm: jest.fn(async () => true),
  askPick: jest.fn(async () => "camera"),
  afterNativePresentation: jest.fn(async () => undefined),
}));
jest.mock("@/lib/pickFile", () => ({
  takePhoto: jest.fn(async () => ({ ok: true, document: { uri: "file:///p.jpg", fileName: "p.jpg", mimeType: "image/jpeg", sizeBytes: 10 } })),
  choosePhoto: jest.fn(),
  discardPickedCopy: jest.fn(async () => undefined),
}));
jest.mock("@/lib/verification", () => ({ sendDocument: jest.fn(async () => ({ status: "saved" })) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getSupplierVerification: jest.fn(),
  getHomePrinter: jest.fn(),
  patchHomePrinter: jest.fn(),
}));

import { HomeLevels } from "@/components/home/HomeLevels";
import * as api from "@/lib/api";
import { sendDocument } from "@/lib/verification";
import { useHomePrinter } from "@/store/homePrinter";
import { askConfirm } from "@/store/sheets";

const mocked = api as jest.Mocked<typeof api>;

const STATUS: HomeStatus = {
  level: "pending",
  verified: false,
  online: false,
  offersPaused: true,
  reason: "home_file_privacy_required",
  deadlineAt: "2026-12-24T00:00:00.000Z",
  weeklyJobs: 0,
  weeklyJobCap: 30,
  offlineUntil: null,
  allowHomePickup: false,
  pinConsentWording: "pin wording",
  filePrivacyWording: "I will keep client files private.",
};
const PIN = { point: null, barangay: "Example barangay", street: "Example street", propertyType: "house" as const, landmark: null, nextChangeAt: null };

function read(status: Partial<HomeStatus>): HomePrinterRead {
  return { version: 2, status: { ...STATUS, ...status }, pin: PIN };
}

function verification(types: string[]) {
  return {
    verification: { verified: false } as never,
    files: types.map((documentType, index) => ({ fileId: `f${index}`, paper: null, documentType, sentAt: null })),
    waiting: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  const home = read({});
  useHomePrinter.setState({ home, error: null });
  mocked.getHomePrinter.mockResolvedValue({ version: 2, homePrinter: home.status, pin: PIN });
  mocked.getSupplierVerification.mockResolvedValue(verification(["valid_id"]));
});

it("shows what is left to Starter, and records the file agreement in GRIDGO's words", async () => {
  mocked.patchHomePrinter.mockResolvedValue({
    version: 3,
    homePrinter: { ...STATUS, reason: "home_starter_review_required" },
    pin: PIN,
  });
  await render(<HomeLevels home={read({})} />);
  expect(screen.getByText("Get to Starter")).toBeTruthy();
  await waitFor(() => expect(screen.getByText("3 steps left")).toBeTruthy());

  await fireEvent.press(screen.getByTestId("privacy-agree"));
  expect((askConfirm as jest.Mock).mock.calls[0][0].consequence).toBe("I will keep client files private.");
  await waitFor(() =>
    expect(mocked.patchHomePrinter).toHaveBeenCalledWith({
      expectedVersion: 2,
      filePrivacyAgreement: { accepted: true, wording: "I will keep client files private." },
    }),
  );
});

it("uploads the test print as sample_work", async () => {
  await render(<HomeLevels home={read({})} />);
  await fireEvent.press(await screen.findByTestId("paper-add-sample_work"));
  await waitFor(() => expect(sendDocument).toHaveBeenCalledWith("sample_work", expect.anything(), expect.any(Function)));
});

it("says GRIDGO is checking once all is in, and asks for Verified papers next", async () => {
  mocked.getSupplierVerification.mockResolvedValue(verification(["valid_id", "id_selfie", "sample_work"]));
  await render(<HomeLevels home={read({ reason: "home_starter_review_required" })} />);
  expect(await screen.findByText("GRIDGO is checking")).toBeTruthy();
  expect(screen.getByText(/^Get Verified by /)).toBeTruthy();
  expect(screen.getByText("Barangay clearance")).toBeTruthy();
  expect(screen.getByText("TIN")).toBeTruthy();
});

it("gives a Starter the weekly limit and the way to Verified", async () => {
  await render(<HomeLevels home={read({ level: "starter", reason: "home_offline", weeklyJobs: 7 })} />);
  expect(screen.getByText("You're a Starter")).toBeTruthy();
  expect(screen.getByText("You can go online on To do. 7 of 30 jobs this week.")).toBeTruthy();
  expect(screen.getByText("Next: Verified")).toBeTruthy();
  expect(screen.queryByTestId("starter-steps")).toBeNull();
});

it("lets a Verified printer allow pickup at home", async () => {
  mocked.patchHomePrinter.mockResolvedValue({ version: 3, homePrinter: { ...STATUS, level: "verified", verified: true, allowHomePickup: true }, pin: PIN });
  await render(<HomeLevels home={read({ level: "verified", verified: true, weeklyJobCap: null, reason: null })} />);
  expect(screen.getByText("You're Verified")).toBeTruthy();
  await fireEvent.press(screen.getByRole("switch"));
  await waitFor(() => expect(mocked.patchHomePrinter).toHaveBeenCalledWith({ expectedVersion: 2, allowHomePickup: true }));
});
