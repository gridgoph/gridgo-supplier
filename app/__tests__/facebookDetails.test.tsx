import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

type Result = { error: unknown };
const ok = async (): Promise<Result> => ({ error: null });

let mockParams: { step?: string } = { step: "contact" };
const mockSignUp = {
  id: "sua_1" as string | undefined,
  status: "missing_requirements",
  emailAddress: null as string | null,
  missingFields: ["email_address"] as string[],
  unverifiedFields: [] as string[],
  existingSession: null,
  update: jest.fn(),
  finalize: jest.fn(ok),
  verifications: {
    sendEmailCode: jest.fn(ok),
    sendPhoneCode: jest.fn(ok),
    verifyEmailCode: jest.fn(),
    verifyPhoneCode: jest.fn(),
  },
};
const mockSignIn = {
  status: "needs_first_factor",
  finalize: jest.fn(ok),
  emailCode: { sendCode: jest.fn(ok), verifyCode: jest.fn() },
  phoneCode: { sendCode: jest.fn(ok), verifyCode: jest.fn() },
};

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isSignedIn: false, getToken: jest.fn(async () => "clerk-jwt") }),
  useClerk: () => ({
    setActive: jest.fn(async () => undefined),
    signOut: jest.fn(async () => undefined),
    user: { firstName: "Ana", lastName: "Reyes", primaryEmailAddress: { emailAddress: "ana@example.com" } },
  }),
  useSignUp: () => ({ signUp: mockSignUp }),
  useSignIn: () => ({ signIn: mockSignIn }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api") as typeof import("@/lib/api");
  return { ...actual, getApiBase: () => "https://gridgo.example", me: jest.fn() };
});

import FacebookDetailsScreen from "@/app/(auth)/facebook-details";
import * as api from "@/lib/api";
import { FACEBOOK_CONTACT_PROBLEM, FACEBOOK_CONTACT_TAKEN, FACEBOOK_NO_EMAIL } from "@/lib/facebookSignIn";
import { EMPTY_SIGNUP_DRAFT, useSignupDraft } from "@/store/signupDraft";
import { useSession } from "@/store/session";

const mockRouter = jest.requireMock("expo-router").router as { replace: jest.Mock; back: jest.Mock };

const approvedShop = {
  id: "u1",
  email: "shop@example.com",
  name: "Ben",
  role: "supplier",
  supplierName: "PrintRight",
  verificationStatus: "approved",
};

async function typeAndSend(value: string) {
  await fireEvent.changeText(screen.getByLabelText("Email or mobile"), value);
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Send my code" }));
  });
}

async function enterCode(button: string) {
  await screen.findByText(/We sent a 6-digit code to/);
  await fireEvent.changeText(screen.getByLabelText("6-digit code"), "123456");
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: button }));
  });
}

describe("Facebook without an email", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { step: "contact" };
    mockSignUp.id = "sua_1";
    mockSignUp.status = "missing_requirements";
    mockSignUp.emailAddress = null;
    mockSignUp.missingFields = ["email_address"];
    mockSignUp.unverifiedFields = [];
    mockSignUp.update.mockImplementation(async () => {
      mockSignUp.missingFields = [];
      mockSignUp.unverifiedFields = ["email_address"];
      return { error: null };
    });
    mockSignUp.verifications.verifyEmailCode.mockImplementation(async () => {
      mockSignUp.status = "complete";
      mockSignUp.unverifiedFields = [];
      return { error: null };
    });
    mockSignUp.verifications.verifyPhoneCode.mockImplementation(async () => {
      mockSignUp.status = "complete";
      return { error: null };
    });
    mockSignIn.status = "needs_first_factor";
    mockSignIn.emailCode.verifyCode.mockImplementation(async () => {
      mockSignIn.status = "complete";
      return { error: null };
    });
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
      sessionWait: null,
    });
    useSignupDraft.setState({ draft: { ...EMPTY_SIGNUP_DRAFT }, hydrated: true });
  });

  it("says why it is asking, and offers another way in", async () => {
    await render(<FacebookDetailsScreen />);
    expect(screen.getByText(FACEBOOK_NO_EMAIL)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Sign in another way" }));
    });
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("names what to type when the field holds neither an email nor a mobile", async () => {
    await render(<FacebookDetailsScreen />);
    await typeAndSend("not a contact");
    expect(await screen.findByText(FACEBOOK_CONTACT_PROBLEM)).toBeTruthy();
    expect(mockSignUp.update).not.toHaveBeenCalled();
  });

  it("verifies an email with a 6-digit code, then finishes and opens apply with the Facebook name", async () => {
    (api.me as jest.Mock).mockRejectedValue(new api.ApiError(401, { error: "unmapped_identity" }));
    await render(<FacebookDetailsScreen />);
    await typeAndSend("ana@example.com");

    expect(mockSignUp.update).toHaveBeenCalledWith({ emailAddress: "ana@example.com" });
    expect(mockSignUp.verifications.sendEmailCode).toHaveBeenCalled();
    await enterCode("Verify email");

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/(auth)/signup/start"));
    expect(mockSignUp.verifications.verifyEmailCode).toHaveBeenCalledWith({ code: "123456" });
    expect(mockSignUp.finalize).toHaveBeenCalled();
    expect(useSignupDraft.getState().draft.contactName).toBe("Ana Reyes");
  });

  it("verifies a mobile with a texted code", async () => {
    mockSignUp.update.mockImplementation(async () => {
      mockSignUp.missingFields = [];
      mockSignUp.unverifiedFields = ["phone_number"];
      return { error: null };
    });
    (api.me as jest.Mock).mockResolvedValue(approvedShop);
    await render(<FacebookDetailsScreen />);
    await typeAndSend("0917 123 4567");

    expect(mockSignUp.update).toHaveBeenCalledWith({ phoneNumber: "+639171234567" });
    expect(mockSignUp.verifications.sendPhoneCode).toHaveBeenCalled();
    expect(screen.getByText("Check your texts")).toBeTruthy();
    await enterCode("Verify my number");

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/home"));
  });

  it("signs in to the existing GRIDGO person when the email already has a login", async () => {
    mockSignUp.update.mockResolvedValue({
      error: { errors: [{ code: "form_identifier_exists", message: "That email address is taken." }] },
    });
    (api.me as jest.Mock).mockResolvedValue(approvedShop);
    await render(<FacebookDetailsScreen />);
    await typeAndSend("shop@example.com");

    expect(await screen.findByText(FACEBOOK_CONTACT_TAKEN)).toBeTruthy();
    expect(mockSignIn.emailCode.sendCode).toHaveBeenCalledWith({ emailAddress: "shop@example.com" });
    expect(mockSignUp.verifications.sendEmailCode).not.toHaveBeenCalled();
    await enterCode("Sign in");

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)/home"));
    expect(mockSignIn.finalize).toHaveBeenCalled();
    // No second account was finished.
    expect(mockSignUp.finalize).not.toHaveBeenCalled();
  });

  it("sends the code at once when Facebook shared an email Clerk wants proved", async () => {
    mockParams = { step: "code" };
    mockSignUp.emailAddress = "ana@example.com";
    mockSignUp.missingFields = [];
    mockSignUp.unverifiedFields = ["email_address"];
    await render(<FacebookDetailsScreen />);

    expect(await screen.findByText(/We sent a 6-digit code to ana@example.com/)).toBeTruthy();
    expect(mockSignUp.verifications.sendEmailCode).toHaveBeenCalledTimes(1);
  });
});
