import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

let mockSignUpStatus = "missing_requirements";
let mockIsSignedIn = false;
let mockFetchStatus = "idle";
let mockSessionLoading = false;
const mockSendEmailCode = jest.fn(async () => ({ error: null }));
const mockVerifyEmailCode = jest.fn(async () => {
  mockSignUpStatus = "complete";
  return { error: null };
});
const mockFinalize = jest.fn(async () => ({ error: null }));
const mockPassword = jest.fn(async () => ({ error: null }));
const mockGetToken = jest.fn(async () => "clerk-jwt");
const mockEnrollSupplier = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isSignedIn: mockIsSignedIn, getToken: mockGetToken }),
  useClerk: () => ({ setActive: jest.fn() }),
  useSignUp: () => ({
    signUp: {
      get status() {
        return mockSignUpStatus;
      },
      unverifiedFields: ["email_address"],
      missingFields: [],
      existingSession: null,
      password: mockPassword,
      finalize: mockFinalize,
      verifications: {
        sendEmailCode: mockSendEmailCode,
        verifyEmailCode: mockVerifyEmailCode,
      },
    },
    get fetchStatus() {
      return mockFetchStatus;
    },
  }),
}));

jest.mock("@/store/session", () => {
  const actual = jest.requireActual("@/store/session") as typeof import("@/store/session");
  return {
    ...actual,
    useSession: () => ({
      enrollSupplier: mockEnrollSupplier,
      loading: mockSessionLoading,
      error: null,
      clearError: jest.fn(),
    }),
  };
});

// The legal library as GRIDGO has it in effect: what the apply box agrees to.
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api") as typeof import("@/lib/api");
  const version = (documentId: string, title: string) => ({
    id: `${documentId}-1`,
    documentId,
    version: 1,
    title,
    audience: documentId === "supplier-agreement" ? "supplier" : "all",
    text: "Placeholder text.",
    effectiveAt: "2026-10-09T02:00:00.000Z",
    placeholder: true,
    material: false,
    penalties: false,
    status: "placeholder",
  });
  return {
    ...actual,
    listLegalDocuments: jest.fn(async () => [
      version("terms-of-service", "Terms of Service"),
      version("privacy-notice", "Privacy Notice"),
      version("supplier-agreement", "Supplier Agreement"),
      version("cookie-notice", "Cookie Notice"),
    ]),
  };
});

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

import ReviewStep from "@/app/(auth)/signup/review";
import { useSignupDraft } from "@/store/signupDraft";

const AGREE = /I am 18 or older and agree, for this shop, to the Terms of Service, Privacy Notice and Supplier Agreement/;

async function agree() {
  const box = await screen.findByRole("checkbox", { name: AGREE });
  await waitFor(() => expect(box).toBeEnabled());
  await fireEvent.press(box);
}

const mockRouter = jest.requireMock("expo-router").router as {
  push: jest.Mock;
  replace: jest.Mock;
};

describe("signup verify then enroll", () => {
  beforeEach(() => {
    mockSignUpStatus = "missing_requirements";
    mockIsSignedIn = false;
    mockFetchStatus = "idle";
    mockSessionLoading = false;
    mockRouter.replace.mockClear();
    mockRouter.push.mockClear();
    mockSendEmailCode.mockClear();
    mockVerifyEmailCode.mockClear();
    mockFinalize.mockClear();
    mockPassword.mockClear();
    mockEnrollSupplier.mockReset();
    mockEnrollSupplier.mockResolvedValue(true);
    useSignupDraft.setState({
      draft: {
        shopName: "PrintRight",
        contactName: "Ben Santos",
        email: "shop@example.com",
        phone: "09171234567",
        password: "secretpass",
        pin: { lat: 7.06, lng: 125.6, label: "Davao" },
        categoryCodes: ["marketing_collateral"],
        enrollKey: "supplier-enroll-test",
        documents: {},
      },
      hydrated: true,
    });
  });

  it("verifies the emailed job number, enrolls, and opens Home", async () => {
    await render(<ReviewStep />);
    await agree();

    await fireEvent.press(screen.getByRole("button", { name: "Send my application" }));

    await waitFor(() => {
      expect(mockSendEmailCode).toHaveBeenCalled();
      expect(screen.getByText("Check your email")).toBeTruthy();
      expect(screen.getByText("Send another code")).toBeTruthy();
      expect(screen.queryByLabelText("Verification code")).toBeNull();
    });

    await fireEvent.changeText(screen.getByLabelText("6-digit job number"), "148203");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Verify email" })).toBeEnabled();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Verify email" }));

    await waitFor(() => {
      expect(mockVerifyEmailCode).toHaveBeenCalledWith({ code: "148203" });
      expect(mockFinalize).toHaveBeenCalled();
      expect(mockEnrollSupplier).toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/home");
    });
  });

  it("does not treat a live Clerk session's sign-up fetch as sending the application", async () => {
    mockIsSignedIn = true;
    mockFetchStatus = "fetching";

    await render(<ReviewStep />);

    expect(screen.getByRole("button", { name: "Send my application" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sending your application…" })).toBeNull();
    expect(
      screen.queryByLabelText("Opening your shop account. Do not close the app."),
    ).toBeNull();
  });

  it("does not treat Clerk projecting the session as sending the application", async () => {
    mockIsSignedIn = true;
    mockSessionLoading = true;
    mockFetchStatus = "fetching";

    await render(<ReviewStep />);

    expect(screen.getByRole("button", { name: "Send my application" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sending your application…" })).toBeNull();
    expect(
      screen.queryByLabelText("Opening your shop account. Do not close the app."),
    ).toBeNull();
  });

  it("enrolls a live Clerk session without mailing a code", async () => {
    mockIsSignedIn = true;
    mockFetchStatus = "fetching";

    await render(<ReviewStep />);
    await agree();
    await fireEvent.press(screen.getByRole("button", { name: "Send my application" }));

    await waitFor(() => {
      expect(mockEnrollSupplier).toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/home");
    });
    expect(mockSendEmailCode).not.toHaveBeenCalled();
    expect(mockPassword).not.toHaveBeenCalled();
  });

  it("sends nothing, and makes no sign-in, until the agreement is ticked", async () => {
    await render(<ReviewStep />);
    const box = await screen.findByRole("checkbox", { name: AGREE });
    expect(box).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Send me GRIDGO news and offers for shops" })).not.toBeChecked();

    await fireEvent.press(screen.getByRole("button", { name: "Send my application" }));

    expect(await screen.findByText("Tick this to send your application.")).toBeTruthy();
    expect(mockPassword).not.toHaveBeenCalled();
    expect(mockEnrollSupplier).not.toHaveBeenCalled();
  });

  it("enrolls with the exact versions shown, and news left unticked", async () => {
    mockIsSignedIn = true;
    await render(<ReviewStep />);
    await agree();
    await fireEvent.press(screen.getByRole("button", { name: "Send my application" }));

    await waitFor(() => expect(mockEnrollSupplier).toHaveBeenCalled());
    const [body] = mockEnrollSupplier.mock.calls[0];
    expect(body.legalConsentVersion).toBe(1);
    expect(body.legalConsent).toMatchObject({
      accepted: true,
      versionIds: ["terms-of-service-1", "privacy-notice-1", "supplier-agreement-1"],
      method: "checkbox",
      junior: false,
      marketing: false,
    });
    expect(body.legalConsent.app).toMatch(/^gridgo-supplier\//);
    expect(typeof body.legalConsent.device).toBe("string");
  });
});
