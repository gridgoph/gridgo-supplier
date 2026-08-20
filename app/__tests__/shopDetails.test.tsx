import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  // The screen reloads whenever it regains focus; on a bench there is one focus.
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(callback, [callback]);
  },
}));

// The portrait and the way into the email change both read the Clerk account.
// Nothing in these cases touches it, so it is a signed-in shop with no picture.
const mockClerkUser = {
  imageUrl: null as string | null,
  hasImage: false,
  setProfileImage: jest.fn(async () => undefined),
  reload: jest.fn(async () => undefined),
};
jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: mockClerkUser }),
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

// Mocked at the transport, not at lib/shopProfile, so the version and the
// which-fields-changed decision are the real ones under test.
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getSupplierProfile: jest.fn(),
  updateSupplierProfile: jest.fn(),
}));

import ShopDetailsScreen from "@/app/shop-details";
import { ApiError, getSupplierProfile, updateSupplierProfile, type SupplierProfile } from "@/lib/api";
import { useSession } from "@/store/session";

const mockRouter = jest.requireMock("expo-router").router as { back: jest.Mock; push: jest.Mock };

const PROFILE: SupplierProfile = {
  userId: "usr_1",
  shopName: "PrintRight Davao",
  contactName: "Ben Santos",
  phone: "+639171234567",
  email: "shop@example.com",
  shop: { lat: 7.07, lng: 125.61, label: "Davao City" },
  pickupAvailable: true,
  version: 3,
  updatedAt: "2026-08-19T02:00:00.000Z",
  media: null,
};

const refresh = jest.fn(async () => undefined);

function load(profile: SupplierProfile = PROFILE) {
  (getSupplierProfile as jest.Mock).mockResolvedValue(profile);
}

describe("the shop's own details", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({ refresh });
  });

  it("shows the details GRIDGO has on file", async () => {
    load();

    const view = await render(<ShopDetailsScreen />);

    const shopName = await screen.findByLabelText("Shop name");
    expect(shopName.props.value).toBe("PrintRight Davao");
    expect(screen.getByLabelText("Contact person").props.value).toBe("Ben Santos");
    expect(screen.getByLabelText("Mobile number").props.value).toBe("+639171234567");
    await view.unmount();
  });

  /**
   * The email is the sign-in, so changing it means proving the new address
   * answers — a screen of its own, never a keystroke in this form. It is shown
   * here as what it is, with the way to change it under it.
   */
  it("states the email and offers the screen that changes it", async () => {
    load();

    const view = await render(<ShopDetailsScreen />);

    expect(await screen.findByText("shop@example.com")).toBeTruthy();
    // Nothing on this screen holds it as an editable value.
    expect(screen.queryByDisplayValue("shop@example.com")).toBeNull();

    await fireEvent.press(screen.getByLabelText("Change email"));
    expect(mockRouter.push).toHaveBeenCalledWith("/change-email");
    await view.unmount();
  });

  /**
   * The portrait belongs to the GRIDGO sign-in, not to GRIDGO's file store, so
   * nothing about it goes through `/me/supplier-profile`.
   */
  it("offers the shop's picture without touching its GRIDGO details", async () => {
    load();

    const view = await render(<ShopDetailsScreen />);

    // No picture yet, so the control invites one rather than offering a change.
    expect(await screen.findByText("Add a photo")).toBeTruthy();
    expect(updateSupplierProfile).not.toHaveBeenCalled();
    await view.unmount();
  });

  // A yellow button with nothing to save is a dead control.
  it("offers no save until something actually changes", async () => {
    load();

    const view = await render(<ShopDetailsScreen />);
    const shopName = await screen.findByLabelText("Shop name");

    expect(screen.queryByLabelText("Save changes")).toBeNull();
    expect(screen.getByText(/Change one to save it/)).toBeTruthy();

    await fireEvent.changeText(shopName, "PrintRight Davao City");

    expect(screen.getByLabelText("Save changes")).toBeTruthy();
    await view.unmount();
  });

  it("sends only the field that changed, against the version it read", async () => {
    load();
    (updateSupplierProfile as jest.Mock).mockResolvedValue({
      ...PROFILE,
      shopName: "PrintRight Davao City",
      version: 4,
    });

    const view = await render(<ShopDetailsScreen />);
    await fireEvent.changeText(
      await screen.findByLabelText("Shop name"),
      "PrintRight Davao City",
    );
    await fireEvent.press(screen.getByLabelText("Save changes"));

    await waitFor(() => {
      expect(updateSupplierProfile).toHaveBeenCalledWith(3, {
        shopName: "PrintRight Davao City",
      });
    });
    // Account reads the shop's name from the session, so it has to be re-read.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    await view.unmount();
  });

  it("catches a typed number before spending a round trip on it", async () => {
    load();

    const view = await render(<ShopDetailsScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Mobile number"), "0917");
    await fireEvent.press(screen.getByLabelText("Save changes"));

    expect(await screen.findByText(/Enter a mobile number/)).toBeTruthy();
    expect(updateSupplierProfile).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await view.unmount();
  });

  /**
   * Somebody else changed the record while this screen was open. Answering
   * that with a retry would put the shop's older name back over the change it
   * cannot see, so the screen offers the latest and stays put.
   */
  it("offers the latest instead of overwriting a change it cannot see", async () => {
    load();
    (updateSupplierProfile as jest.Mock).mockRejectedValue(
      new ApiError(409, {
        error: "supplier_profile_stale",
        expectedVersion: 3,
        currentVersion: 4,
      }),
    );

    const view = await render(<ShopDetailsScreen />);
    await fireEvent.changeText(
      await screen.findByLabelText("Shop name"),
      "PrintRight Davao City",
    );
    await fireEvent.press(screen.getByLabelText("Save changes"));

    expect(await screen.findByText(/changed somewhere else/)).toBeTruthy();
    expect(screen.getByLabelText("Load the latest")).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();

    // Asking for the latest replaces the draft with what GRIDGO has.
    (getSupplierProfile as jest.Mock).mockResolvedValue({
      ...PROFILE,
      shopName: "PrintRight Toril",
      version: 4,
    });
    await fireEvent.press(screen.getByLabelText("Load the latest"));

    await waitFor(() =>
      expect(screen.getByLabelText("Shop name").props.value).toBe("PrintRight Toril"),
    );
    expect(screen.queryByText(/changed somewhere else/)).toBeNull();
    await view.unmount();
  });

  // The route ships with the platform, not with this app.
  it("says plainly when GRIDGO has not opened this yet", async () => {
    (getSupplierProfile as jest.Mock).mockRejectedValue(
      new ApiError(404, { error: "supplier_profile_not_found" }),
    );

    const view = await render(<ShopDetailsScreen />);

    expect(await screen.findByText("Your shop details are not open yet")).toBeTruthy();
    expect(screen.queryByLabelText("Shop name")).toBeNull();
    expect(screen.getByLabelText("Check again")).toBeTruthy();
    await view.unmount();
  });

  it("puts a refusal from GRIDGO on the field it was about", async () => {
    load();
    (updateSupplierProfile as jest.Mock).mockRejectedValue(
      new ApiError(400, {
        error: "invalid_supplier_profile",
        field: "phone",
        message: "phone must be a valid PH mobile number",
      }),
    );

    const view = await render(<ShopDetailsScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Mobile number"), "0917 000 1111");
    await fireEvent.press(screen.getByLabelText("Save changes"));

    expect(await screen.findByText(/would not accept that mobile number/)).toBeTruthy();
    expect(screen.queryByText(/must be a valid PH/)).toBeNull();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await view.unmount();
  });
});
