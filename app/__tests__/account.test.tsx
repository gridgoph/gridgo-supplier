import { render, screen, waitFor } from "@testing-library/react-native";

/**
 * Expo Router runs a screen's focus effect every time it comes back into view.
 * On a bench there is one mount, so the callback is kept and fired again by
 * hand — coming back from the shop's details is the case under test.
 */
const focusCallbacks: (() => void)[] = [];
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(() => {
      focusCallbacks.push(callback);
      callback();
      return () => {
        const at = focusCallbacks.indexOf(callback);
        if (at >= 0) focusCallbacks.splice(at, 1);
      };
    }, [callback]);
  },
}));

const mockClerkUser = {
  firstName: "Ben",
  lastName: "Santos",
  imageUrl: "https://img.clerk.test/lovis.jpg",
  hasImage: true,
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

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  me: jest.fn(),
}));

import AccountScreen from "@/app/(tabs)/account";
import { me } from "@/lib/api";
import { useSession } from "@/store/session";

const shop = {
  id: "u1",
  email: "ben@lovisprint.ph",
  name: "Ben Santos",
  role: "supplier" as const,
  supplierName: "Lovis Printshop",
  verificationStatus: "approved" as const,
};

/** Fire the focus effect again, the way returning to a tab does. */
async function refocus() {
  for (const callback of [...focusCallbacks]) callback();
}

describe("the shop's account", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    focusCallbacks.length = 0;
    (me as jest.Mock).mockResolvedValue(shop);
    useSession.setState({
      user: shop,
      loading: false,
      error: null,
      authSource: "clerk",
      identity: { kind: "supplier" },
    });
  });

  afterEach(async () => {
    await view?.unmount();
    view = undefined;
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
    });
  });

  it("leads with the shop, the person and the sign-in", async () => {
    view = await render(<AccountScreen />);

    expect(await screen.findByText("Lovis Printshop")).toBeTruthy();
    expect(screen.getByText("Ben Santos")).toBeTruthy();
    expect(screen.getByText("ben@lovisprint.ph")).toBeTruthy();
    expect(screen.getByLabelText("Lovis Printshop, shop photo")).toBeTruthy();
  });

  /**
   * The captain deleted this sentence. An approved shop keeps the chip, which
   * says the same thing in two words, and gains nothing from a paragraph
   * describing a rule it is not about to break.
   */
  it("says a shop is accredited with the chip and nothing more", async () => {
    view = await render(<AccountScreen />);

    expect(await screen.findByText("Accredited")).toBeTruthy();
    expect(screen.queryByText(/GRIDGO matches work to your shop/)).toBeNull();
    expect(screen.queryByText(/Operations can pause that/)).toBeNull();
  });

  /** A shop still waiting keeps the line that tells it what the wait is. */
  it("keeps the wait in words for a shop Operations has not approved", async () => {
    const pending = { ...shop, verificationStatus: "pending" as const };
    (me as jest.Mock).mockResolvedValue(pending);
    useSession.setState({ user: pending });

    view = await render(<AccountScreen />);

    expect(await screen.findByText("With Operations")).toBeTruthy();
    expect(screen.getByText(/No job is matched until they approve/)).toBeTruthy();
  });

  /**
   * The captain's report: the shop name was changed on the details screen and
   * this card still showed the one from enrollment. The card is one tap from
   * the screen that corrects it, so coming back is exactly when it must ask
   * GRIDGO again rather than redraw what the session happened to be holding.
   */
  it("shows the renamed shop when it comes back into view", async () => {
    view = await render(<AccountScreen />);

    expect(await screen.findByText("Lovis Printshop")).toBeTruthy();

    (me as jest.Mock).mockResolvedValue({ ...shop, supplierName: "Lovis Print Shop" });
    await refocus();

    expect(await screen.findByText("Lovis Print Shop")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Lovis Printshop")).toBeNull());
  });

  /** A shop with no picture yet gets the shop mark, never a letter in a disc. */
  it("draws an empty portrait rather than an initial", async () => {
    mockClerkUser.imageUrl = "";
    mockClerkUser.hasImage = false;
    try {
      view = await render(<AccountScreen />);

      expect(await screen.findByLabelText("Lovis Printshop, no shop photo yet")).toBeTruthy();
      expect(screen.queryByText("L")).toBeNull();
    } finally {
      mockClerkUser.imageUrl = "https://img.clerk.test/lovis.jpg";
      mockClerkUser.hasImage = true;
    }
  });
});
