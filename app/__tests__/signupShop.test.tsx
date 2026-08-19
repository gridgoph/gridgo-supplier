import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

let mockIsSignedIn = false;
let mockClerkEmail: string | null = null;

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isSignedIn: mockIsSignedIn }),
  useUser: () => ({
    user: mockClerkEmail
      ? { primaryEmailAddress: { emailAddress: mockClerkEmail } }
      : null,
  }),
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

import ShopIdentityStep from "@/app/(auth)/signup/index";
import { EMPTY_SIGNUP_DRAFT, useSignupDraft } from "@/store/signupDraft";

const mockRouter = jest.requireMock("expo-router").router as {
  push: jest.Mock;
  replace: jest.Mock;
};

describe("apply shop step with a live Clerk session", () => {
  beforeEach(() => {
    mockIsSignedIn = true;
    mockClerkEmail = "shop@example.com";
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    useSignupDraft.setState({
      draft: {
        ...EMPTY_SIGNUP_DRAFT,
        shopName: "Mark Prints",
        contactName: "Mark David",
        email: "shop@example.com",
        phone: "09975643866",
      },
      hydrated: true,
    });
  });

  it("does not ask for a password, and continues with the shop details already on the phone", async () => {
    await render(<ShopIdentityStep />);

    expect(screen.getByText(/Finish opening your shop/)).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByText("I already have an account")).toBeNull();
    expect(screen.getByLabelText("Email").props.editable).toBe(false);

    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith("/(auth)/signup/location");
    });
  });

  it("fills the email from the live Clerk session", async () => {
    mockClerkEmail = "shop@example.com";
    useSignupDraft.setState({
      draft: EMPTY_SIGNUP_DRAFT,
      hydrated: true,
    });

    await render(<ShopIdentityStep />);

    await waitFor(() => {
      expect(screen.getByLabelText("Email").props.value).toBe("shop@example.com");
    });
  });
});
