import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import * as api from "@/lib/api";
import type { GuidedSignup } from "@/lib/guidedSignup";
import { useGuidedSignup } from "@/store/guidedSignup";
import { EMPTY_SIGNUP_DRAFT, useSignupDraft } from "@/store/signupDraft";

let mockSignedIn = false;
const mockGetToken = async () => "token";

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useFocusEffect: (effect: () => void) => useEffect(() => effect(), [effect]),
    useLocalSearchParams: () => ({}),
    Stack: { Screen: () => null },
  };
});

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isSignedIn: mockSignedIn, getToken: mockGetToken }),
  useUser: () => ({ user: null }),
  useClerk: () => ({ publishableKey: "", setActive: jest.fn() }),
  useSignUp: () => ({ signUp: null }),
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

// The map is a WebView: a tap here stands in for a tap on it.
jest.mock("@/components/ShopLocationPicker", () => {
  const { Pressable, Text } = require("react-native");
  return {
    ShopLocationPicker: ({ onChange }: { onChange: (pin: { lat: number; lng: number; label: string }) => void }) => (
      <Pressable onPress={() => onChange({ lat: 7.07, lng: 125.61, label: "Pinned street" })}>
        <Text>Drop the pin</Text>
      </Pressable>
    ),
  };
});

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    setTokenProvider: jest.fn(),
    getGuidedSignup: jest.fn(),
    saveGuidedSignupStep: jest.fn(),
    getHomePrinterOffered: jest.fn(),
  };
});

import SignupMissionsScreen from "@/app/(auth)/signup/missions";
import SignupPinStep from "@/app/(auth)/signup/pin";
import SignupPrintsStep from "@/app/(auth)/signup/prints";
import SignupStartStep from "@/app/(auth)/signup/start";

const mocked = api as jest.Mocked<typeof api>;
const mockRouter = jest.requireMock("expo-router").router as { push: jest.Mock; back: jest.Mock };

const HOME_CONSENT =
  "I agree that clients see only my barangay and approximate distance, paid home-pickup clients see my street, and the assigned rider sees my exact pin only during an active job.";
const TERMS = {
  printGroups: ["documents", "marketing"],
  locationConsentWording: HOME_CONSENT,
  payoutConsentWording: "I authorize GRIDGO to send payouts to this QR account.",
  documentRates: { bwMinor: 300, colourMinor: 500 },
};
const HOME = { shopKind: "home_printer", registrantRole: "owner", adult: true } as const;

function signup(partial: Partial<GuidedSignup>): GuidedSignup {
  return { version: 3, supplierId: null, steps: {}, nextStep: "eligibility", ...partial };
}

function givenSignup(row: GuidedSignup) {
  useGuidedSignup.setState({ mode: "guided", signup: row, terms: TERMS, error: null });
  mocked.getGuidedSignup.mockResolvedValue({ signup: row, ...TERMS });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignedIn = false;
  useGuidedSignup.getState().reset();
  useSignupDraft.setState({ draft: { ...EMPTY_SIGNUP_DRAFT }, hydrated: true });
  mocked.saveGuidedSignupStep.mockImplementation(async (_version, step, value) => ({
    signup: signup({ version: 4, steps: { eligibility: HOME, [step]: value }, nextStep: "prints" }),
    ...TERMS,
  }));
});

describe("step 0", () => {
  it("does not offer home printing on a GRIDGO without it", async () => {
    mocked.getHomePrinterOffered.mockResolvedValue(false);
    await render(<SignupStartStep />);
    await waitFor(() => expect(mocked.getHomePrinterOffered).toHaveBeenCalled());
    expect(screen.getByText("I have a print shop")).toBeTruthy();
    expect(screen.queryByText("I print from home")).toBeNull();
  });

  it("offers I print from home, then drops the owner question and goes to the sign-in", async () => {
    mocked.getHomePrinterOffered.mockResolvedValue(true);
    await render(<SignupStartStep />);
    await fireEvent.press(await screen.findByText("I print from home"));
    expect(screen.queryByText("Are you the owner?")).toBeNull();
    expect(screen.getByTestId("home-kind-note")).toBeTruthy();
    await fireEvent.press(screen.getByText("I am 18 or older"));
    await fireEvent.press(screen.getByRole("button", { name: /Start/ }));
    expect(mockRouter.push).toHaveBeenCalledWith("/(auth)/signup/account");
  });
});

describe("a GRIDGO that does not take home printers yet", () => {
  it("shows the choice before sign-in, then hides it once GRIDGO answers like a shop", async () => {
    const SHOP_WORDING = "I agree that GRIDGO may store and use my shop location.";
    mocked.getHomePrinterOffered.mockRejectedValue(new api.ApiError(401, { error: "unauthorized" }));
    mockSignedIn = true;
    useSignupDraft.setState({ draft: { ...EMPTY_SIGNUP_DRAFT, eligibility: { ...HOME } }, hydrated: true });
    const shopTerms = { ...TERMS, locationConsentWording: SHOP_WORDING };
    mocked.getGuidedSignup.mockResolvedValue({ signup: signup({ version: 0 }), ...shopTerms });
    mocked.saveGuidedSignupStep.mockResolvedValue({
      signup: signup({ version: 1, steps: { eligibility: HOME }, nextStep: "shop" }),
      ...shopTerms,
    });
    await render(<SignupStartStep />);
    await waitFor(() => expect(mocked.saveGuidedSignupStep).toHaveBeenCalledWith(0, "eligibility", HOME));
    await waitFor(() => expect(useGuidedSignup.getState().homeUnavailable).toBe(true));
    expect(useSignupDraft.getState().draft.eligibility?.shopKind).toBeNull();
    expect(jest.requireMock("expo-router").router.replace).not.toHaveBeenCalledWith("/(auth)/signup/missions");
  });
});

describe("the missions map", () => {
  it("has no shop hours, and ends at Starter before the first job", async () => {
    givenSignup(signup({ steps: { eligibility: HOME }, nextStep: "shop" }));
    await render(<SignupMissionsScreen />);
    await waitFor(() => expect(screen.getByText("0 of 5 done · about 4 min left")).toBeTruthy());
    expect(screen.queryByText("Your hours")).toBeNull();
    expect(screen.getByText("Get to Starter")).toBeTruthy();
    expect(screen.getByText("Before your first job")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue: About you/ })).toBeTruthy();
  });
});

describe("the home pin", () => {
  it("says who sees what beside GRIDGO's consent, and sends the private pin shape", async () => {
    givenSignup(signup({ steps: { eligibility: HOME, shop: { shopName: "Night prints", contactName: "A", phone: "+639170000412" } }, nextStep: "location" }));
    await render(<SignupPinStep />);
    expect(screen.getByText("Your address stays private")).toBeTruthy();
    expect(screen.getByText(HOME_CONSENT)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: /Save my pin/ }));
    expect(screen.getByText("Enter your barangay.")).toBeTruthy();
    expect(mocked.saveGuidedSignupStep).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText("Drop the pin"));
    await fireEvent.changeText(screen.getByLabelText("Barangay"), "Example barangay");
    await fireEvent.changeText(screen.getByLabelText("Street"), "Example street");
    await fireEvent.press(screen.getByText("Boarding house"));
    await fireEvent.press(screen.getByText(HOME_CONSENT));
    await fireEvent.press(screen.getByRole("button", { name: /Save my pin/ }));

    await waitFor(() =>
      expect(mocked.saveGuidedSignupStep).toHaveBeenCalledWith(3, "location", {
        point: { lat: 7.07, lng: 125.61 },
        barangay: "Example barangay",
        street: "Example street",
        propertyType: "boarding_house",
        consent: { accepted: true, wording: HOME_CONSENT },
      }),
    );
  });
});

describe("what you print", () => {
  it("asks only for documents on Short, A4 and Long", async () => {
    givenSignup(signup({ steps: { eligibility: HOME }, nextStep: "prints" }));
    await render(<SignupPrintsStep />);
    expect(screen.queryByText("A3")).toBeNull();
    expect(screen.queryByText("Your shop prints")).toBeNull();
    expect(screen.queryByText("Stapling, binding, photo paper")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /Save/ }));
    await waitFor(() =>
      expect(mocked.saveGuidedSignupStep).toHaveBeenCalledWith(3, "prints", {
        groups: ["documents"],
        documents: { papers: ["short", "a4", "long"], colours: ["bw", "colour"], duplex: true },
      }),
    );
  });
});
