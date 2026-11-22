import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

/**
 * Get verified (report F318781A): skippable, uploads each paper as it is
 * picked with progress and Try again, then reads "Checking" while jobs go on.
 */
const mockParams: { first?: string } = {};
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(() => {
      callback();
    }, [callback]);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getSupplierVerification: jest.fn(),
}));
jest.mock("@/lib/verification", () => ({ sendDocument: jest.fn() }));
jest.mock("@/lib/pickFile", () => ({
  takePhoto: jest.fn(),
  choosePhoto: jest.fn(),
  discardPickedCopy: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/store/sheets", () => ({
  askPick: jest.fn(),
  afterNativePresentation: () => Promise.resolve(),
}));

import VerifyScreen from "@/app/verify";
import { VerifyNoticeCard } from "@/components/verify/VerifyNoticeCard";
import { WaitingPayoutList } from "@/components/verify/WaitingPayoutList";
import { useShopVerification } from "@/hooks/useShopVerification";
import { getSupplierVerification } from "@/lib/api";
import { choosePhoto, discardPickedCopy } from "@/lib/pickFile";
import { readVerification, todoVerifyNotice } from "@/lib/shopVerification";
import { sendDocument } from "@/lib/verification";
import { askPick } from "@/store/sheets";
import { useSession } from "@/store/session";
import { router } from "expo-router";

const summary = {
  verified: false,
  verificationState: "not_submitted" as const,
  deadlineAt: "2026-12-20T00:00:00.000Z",
  daysLeft: 28,
  countdownDays: null,
  payoutCapMinor: 500000,
  paidBeforeVerificationMinor: 0,
  remainingCapMinor: 500000,
  capReached: false,
  heldMinor: 0,
  recoveryDueMinor: 0,
  paidOpenRegularJobs: 0,
  newOrdersPaused: false,
};

const owner = {
  id: "s1",
  email: "owner@example.test",
  name: "Owner",
  role: "supplier" as const,
  supplierName: "Test Print Shop",
  verificationStatus: "pending" as const,
  verification: summary,
};

const picked = { uri: "file:///id.jpg", fileName: "id.jpg", mimeType: "image/jpeg", sizeBytes: 1000 };

beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.first;
  useSession.setState({ user: owner });
  (getSupplierVerification as jest.Mock).mockResolvedValue({ verification: summary, files: [], waiting: [] });
  (askPick as jest.Mock).mockResolvedValue("gallery");
  (choosePhoto as jest.Mock).mockResolvedValue({ ok: true, document: picked });
});

describe("Get verified", () => {
  it("lists the benefits and three papers, with the cap from GRIDGO", async () => {
    await render(<VerifyScreen />);
    expect(await screen.findByText("Verified shops get more jobs")).toBeTruthy();
    expect(screen.getByText("Until then, payouts stop at ₱5,000.00")).toBeTruthy();
    for (const title of ["Your ID", "Selfie with your ID", "Business permit"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText(/You have 28 days before new orders pause/)).toBeTruthy();
  });

  it("can be skipped right after sign-up", async () => {
    mockParams.first = "1";
    await render(<VerifyScreen />);
    await fireEvent.press(await screen.findByText("Skip for now"));
    expect(router.back).toHaveBeenCalled();
  });

  it("uploads a paper as soon as it is picked, then reads Checking", async () => {
    (sendDocument as jest.Mock).mockImplementation(async (_kind, _doc, onProgress) => {
      onProgress(0.5);
      return { status: "saved" };
    });
    await render(<VerifyScreen />);
    await fireEvent.press(await screen.findByTestId("paper-add-valid_id"));
    await waitFor(() => expect(sendDocument).toHaveBeenCalledWith("valid_id", picked, expect.any(Function)));
    expect(await screen.findByText("Checking")).toBeTruthy();
    expect(screen.getByText("Verified shops get more jobs")).toBeTruthy();
    // The phone's copy of the ID goes once GRIDGO has it.
    expect(discardPickedCopy).toHaveBeenCalledWith(picked);
  });

  it("offers Try again with the same photo when an upload fails", async () => {
    (sendDocument as jest.Mock)
      .mockResolvedValueOnce({ status: "failed", message: "The file could not be sent. Try again." })
      .mockResolvedValueOnce({ status: "saved" });
    await render(<VerifyScreen />);
    await fireEvent.press(await screen.findByTestId("paper-add-business_permit"));
    expect(await screen.findByText("The file could not be sent. Try again.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Try again"));
    await waitFor(() => expect(sendDocument).toHaveBeenCalledTimes(2));
    expect((sendDocument as jest.Mock).mock.calls[1][1]).toBe(picked);
    expect(await screen.findByText("Checking")).toBeTruthy();
    // Kept for the retry, deleted only after it went through.
    expect(discardPickedCopy).toHaveBeenCalledTimes(1);
    expect(discardPickedCopy).toHaveBeenCalledWith(picked);
  });

  it("keeps a failed photo only while the screen is open", async () => {
    (sendDocument as jest.Mock).mockResolvedValueOnce({ status: "failed", message: "The file could not be sent. Try again." });
    const view = await render(<VerifyScreen />);
    await fireEvent.press(await screen.findByTestId("paper-add-valid_id"));
    expect(await screen.findByText("The file could not be sent. Try again.")).toBeTruthy();
    expect(discardPickedCopy).not.toHaveBeenCalled();
    await view.unmount();
    expect(discardPickedCopy).toHaveBeenCalledWith(picked);
  });

  it("shows papers GRIDGO already has as being checked", async () => {
    (getSupplierVerification as jest.Mock).mockResolvedValue({
      verification: { ...summary, verificationState: "being_checked" },
      files: [{ fileId: "f1", paper: "id_selfie", sentAt: "2026-11-21T06:14:00.000Z" }],
      waiting: [],
    });
    await render(<VerifyScreen />);
    expect(await screen.findByText("Checking")).toBeTruthy();
    expect(screen.getAllByText("Add")).toHaveLength(2);
  });
});

function Probe() {
  const { read } = useShopVerification();
  return <Text>{read ? "read" : "none"}</Text>;
}

describe("who reads verification", () => {
  it("never asks for it for Staff", async () => {
    useSession.setState({ user: { ...owner, shopRole: "staff" } });
    await render(<Probe />);
    await act(async () => undefined);
    expect(getSupplierVerification).not.toHaveBeenCalled();
    expect(screen.getByText("none")).toBeTruthy();
  });

  it("never asks for it for a verified shop", async () => {
    useSession.setState({ user: { ...owner, verificationStatus: "approved", verification: null } });
    await render(<Probe />);
    await act(async () => undefined);
    expect(getSupplierVerification).not.toHaveBeenCalled();
  });

  it("reads it for the Owner of a shop taking jobs before it is verified", async () => {
    await render(<Probe />);
    expect(await screen.findByText("read")).toBeTruthy();
  });

  it("settles a session whose own read failed, once a read lands", async () => {
    useSession.setState({ user: { ...owner, verification: null, verificationUnreachable: true } });
    await render(<Probe />);
    expect(await screen.findByText("read")).toBeTruthy();
    expect(useSession.getState().user?.verification).toEqual(summary);
    expect(useSession.getState().user?.verificationUnreachable).toBe(false);
  });

  it("closes the floor when GRIDGO answers that it does not offer it", async () => {
    (getSupplierVerification as jest.Mock).mockResolvedValue(null);
    useSession.setState({ user: { ...owner, verification: null, verificationUnreachable: true } });
    await render(<Probe />);
    await waitFor(() => expect(useSession.getState().user?.verificationUnreachable).toBe(false));
    expect(useSession.getState().user?.verification).toBeNull();
  });

  it("keeps the session as it was when the read fails", async () => {
    (getSupplierVerification as jest.Mock).mockRejectedValue(new Error("offline"));
    await render(<Probe />);
    await act(async () => undefined);
    expect(useSession.getState().user?.verification).toEqual(summary);
  });
});

describe("the cards", () => {
  it("shows the countdown chip near the deadline and opens Get verified", async () => {
    const notice = todoVerifyNotice(readVerification({ ...summary, daysLeft: 5, countdownDays: 5 })!, [])!;
    await render(<VerifyNoticeCard notice={notice} testID="card" />);
    expect(screen.getByText("5 days left")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("card-action"));
    expect(router.push).toHaveBeenCalledWith("/verify");
  });

  it("marks a pause with its own chip", async () => {
    const notice = todoVerifyNotice(readVerification({ ...summary, newOrdersPaused: true, daysLeft: 0 })!, [])!;
    await render(<VerifyNoticeCard notice={notice} />);
    expect(screen.getByText("New orders paused")).toBeTruthy();
  });

  it("lists staged payments waiting on verification as waiting", async () => {
    await render(
      <WaitingPayoutList
        waiting={[
          { key: "o1:production_started", orderId: "o1", amountMinor: 86000, reason: "cap" },
          { key: "o2:delivered", orderId: "o2", amountMinor: 14000, reason: "open_jobs" },
        ]}
      />,
    );
    expect(screen.getByText("₱1,000.00")).toBeTruthy();
    expect(screen.getAllByText("Waiting")).toHaveLength(2);
    expect(screen.getByText("Waiting for your verification. Paid once you're verified.")).toBeTruthy();
  });
});
