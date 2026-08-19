import { render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: () => undefined,
}));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: null }),
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

import HomeScreen from "@/app/(tabs)/home";
import { useSession } from "@/store/session";

const pendingShop = {
  id: "u1",
  email: "shop@example.com",
  name: "Ben",
  role: "supplier" as const,
  supplierName: "PrintRight",
  verificationStatus: "pending" as const,
};

describe("Home for a shop waiting on Operations", () => {
  afterEach(() => {
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
    });
  });

  it("tells the truth about the wait instead of a quiet floor", async () => {
    useSession.setState({
      user: pendingShop,
      loading: false,
      error: null,
      authSource: "clerk",
      identity: { kind: "supplier" },
    });

    const view = await render(<HomeScreen />);

    expect(screen.getByText("Operations is reviewing your shop")).toBeTruthy();
    expect(screen.getByText("The floor stays empty until they approve.")).toBeTruthy();
    expect(screen.queryByText("Nothing owed today")).toBeNull();
    expect(screen.queryByText(/nothing needs you/i)).toBeNull();
    expect(screen.getByText("Open accreditation")).toBeTruthy();
    await view.unmount();
  });
});
