import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import PayoutAccountScreen from "@/app/payout-account";
import { ApiError, getPayoutAccount, updatePayoutAccount, type PayoutAccount } from "@/lib/api";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

// Mocked at the transport, so the version and which-fields-changed logic is real.
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getPayoutAccount: jest.fn(),
  updatePayoutAccount: jest.fn(),
  getDownloadUrl: jest.fn(async () => ({ url: "https://files.test/qr", expiresAt: "", expiresInSeconds: 300 })),
}));

const mockRouter = jest.requireMock("expo-router").router as { back: jest.Mock; push: jest.Mock };

const ACCOUNT: PayoutAccount = {
  supplierId: "usr_1",
  provider: "gcash",
  accountName: "Ben S.",
  accountNumber: "+639171234567",
  institution: null,
  qr: { fileId: "file_qr", originalFilename: "gcash.jpg", detectedContentType: "image/jpeg", size: 1000, readyAt: "2026-09-15T00:00:00.000Z" },
  version: 2,
  updatedAt: "2026-09-15T00:00:00.000Z",
};

describe("where the shop gets paid", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("invites a shop with no account to set one up, and offers no save yet", async () => {
    (getPayoutAccount as jest.Mock).mockResolvedValue(null);

    const view = await render(<PayoutAccountScreen />);

    expect(await screen.findByLabelText("No payout QR yet")).toBeTruthy();
    expect(screen.getByText("Take photo")).toBeTruthy();
    expect(screen.getByText("Choose picture")).toBeTruthy();
    expect(screen.queryByLabelText("Save payout account")).toBeNull();
    expect(screen.getByText(/Choose a wallet and add your name/)).toBeTruthy();
    await view.unmount();
  });

  it("creates the account with the wallet, name and number, against no version", async () => {
    (getPayoutAccount as jest.Mock).mockResolvedValue(null);
    (updatePayoutAccount as jest.Mock).mockResolvedValue({ ...ACCOUNT, qr: null, version: 1 });

    const view = await render(<PayoutAccountScreen />);
    await screen.findByLabelText("Paid through");

    await fireEvent.press(screen.getByLabelText("GCash"));
    await fireEvent.changeText(screen.getByLabelText("Account name"), "Ben S.");
    await fireEvent.changeText(screen.getByLabelText("Wallet mobile number"), "0917 123 4567");
    await fireEvent.press(screen.getByLabelText("Save payout account"));

    await waitFor(() =>
      expect(updatePayoutAccount).toHaveBeenCalledWith(null, {
        provider: "gcash",
        accountName: "Ben S.",
        accountNumber: "0917 123 4567",
      }),
    );
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    await view.unmount();
  });

  it("shows the saved plate and offers to replace or take it down", async () => {
    (getPayoutAccount as jest.Mock).mockResolvedValue(ACCOUNT);

    const view = await render(<PayoutAccountScreen />);

    expect(await screen.findByLabelText("Your payout QR")).toBeTruthy();
    expect(screen.getByText("Retake photo")).toBeTruthy();
    expect(screen.getByLabelText("Take down your payout QR")).toBeTruthy();
    expect(screen.getByLabelText("Account name").props.value).toBe("Ben S.");
    expect(screen.queryByLabelText("Save changes")).toBeNull();
    await view.unmount();
  });

  it("catches a typed wallet number before spending a round trip on it", async () => {
    (getPayoutAccount as jest.Mock).mockResolvedValue(ACCOUNT);

    const view = await render(<PayoutAccountScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Wallet mobile number"), "0917");
    await fireEvent.press(screen.getByLabelText("Save changes"));

    expect(await screen.findByText(/Enter the mobile number this wallet/)).toBeTruthy();
    expect(updatePayoutAccount).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("asks for the bank's name once a bank is chosen", async () => {
    (getPayoutAccount as jest.Mock).mockResolvedValue(ACCOUNT);

    const view = await render(<PayoutAccountScreen />);
    await screen.findByLabelText("Paid through");
    expect(screen.queryByLabelText("Bank")).toBeNull();

    await fireEvent.press(screen.getByLabelText("Bank transfer"));
    expect(screen.getByLabelText("Bank")).toBeTruthy();
    expect(screen.getByLabelText("Account number")).toBeTruthy();
    await view.unmount();
  });

  it("offers the latest instead of overwriting a change it cannot see", async () => {
    (getPayoutAccount as jest.Mock).mockResolvedValue(ACCOUNT);
    (updatePayoutAccount as jest.Mock).mockRejectedValue(
      new ApiError(409, { error: "payout_account_stale", expectedVersion: 2, currentVersion: 3 }),
    );

    const view = await render(<PayoutAccountScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Account name"), "Ben Santos");
    await fireEvent.press(screen.getByLabelText("Save changes"));

    expect(await screen.findByText(/changed somewhere else/)).toBeTruthy();
    expect(updatePayoutAccount).toHaveBeenCalledWith(2, { accountName: "Ben Santos" });
    expect(mockRouter.back).not.toHaveBeenCalled();

    (getPayoutAccount as jest.Mock).mockResolvedValue({ ...ACCOUNT, accountName: "Lovis", version: 3 });
    await fireEvent.press(screen.getByLabelText("Load the latest"));
    await waitFor(() => expect(screen.getByLabelText("Account name").props.value).toBe("Lovis"));
    await view.unmount();
  });

  it("says plainly when GRIDGO has not opened this yet", async () => {
    (getPayoutAccount as jest.Mock).mockRejectedValue(new ApiError(404, { error: "not_found" }));

    const view = await render(<PayoutAccountScreen />);

    expect(await screen.findByText("Payout accounts are not open yet")).toBeTruthy();
    expect(screen.queryByLabelText("Account name")).toBeNull();
    expect(screen.getByLabelText("Check again")).toBeTruthy();
    await view.unmount();
  });
});
