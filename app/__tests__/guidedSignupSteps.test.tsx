import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import * as api from "@/lib/api";
import type { GuidedSignup } from "@/lib/guidedSignup";
import { useGuidedSignup } from "@/store/guidedSignup";
import { useLegalLibrary } from "@/store/legalLibrary";
import { useSession } from "@/store/session";
import { EMPTY_SIGNUP_DRAFT, useSignupDraft } from "@/store/signupDraft";

let mockSignedIn = false;
let mockClerkUser: unknown = null;
// Clerk's getToken is stable across renders; focus effects depend on that.
const mockGetToken = async () => "token";

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useFocusEffect: (effect: () => void) => useEffect(() => effect(), [effect]),
    useLocalSearchParams: () => ({}),
  };
});

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isSignedIn: mockSignedIn, getToken: mockGetToken }),
  useUser: () => ({ user: mockClerkUser }),
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

// The map is a WebView; the step only needs a pin to come back from it.
jest.mock("@/components/ShopLocationPicker", () => ({
  ShopLocationPicker: () => null,
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    setTokenProvider: jest.fn(),
    getGuidedSignup: jest.fn(),
    saveGuidedSignupStep: jest.fn(),
    listLegalDocuments: jest.fn(),
  };
});

import SignupMissionsScreen from "@/app/(auth)/signup/missions";
import SignupOpenShopStep from "@/app/(auth)/signup/open-shop";
import SignupPinStep from "@/app/(auth)/signup/pin";
import SignupPrintsStep from "@/app/(auth)/signup/prints";
import SignupStartStep from "@/app/(auth)/signup/start";
import SignupYourShopStep from "@/app/(auth)/signup/your-shop";

const mocked = api as jest.Mocked<typeof api>;
const mockRouter = jest.requireMock("expo-router").router as {
  push: jest.Mock;
  replace: jest.Mock;
  back: jest.Mock;
};

const TERMS = {
  printGroups: ["marketing", "documents", "banners"],
  locationConsentWording: "I agree that GRIDGO may store and use my shop location.",
  payoutConsentWording: "I authorize GRIDGO to send shop payouts to this QR account.",
  documentRates: { bwMinor: 300, colourMinor: 500 },
};

const ELIGIBILITY = { shopKind: "print_shop", registrantRole: "owner", adult: true } as const;
const SHOP = { shopName: "Corner Prints", contactName: "Test Owner", phone: "+639170000265" };

function signup(partial: Partial<GuidedSignup>): GuidedSignup {
  return { version: 3, supplierId: null, steps: {}, nextStep: "eligibility", ...partial };
}

function answer(row: GuidedSignup) {
  return { signup: row, ...TERMS };
}

function givenSignup(row: GuidedSignup) {
  useGuidedSignup.setState({ mode: "guided", signup: row, terms: TERMS, error: null });
  mocked.getGuidedSignup.mockResolvedValue(answer(row));
}

function verifiedClerkUser(phoneNumber: string) {
  return {
    phoneNumbers: [{ id: "idn_1", phoneNumber, verification: { status: "verified" } }],
    createPhoneNumber: jest.fn(),
    reload: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignedIn = true;
  mockClerkUser = null;
  useGuidedSignup.getState().reset();
  useSignupDraft.setState({ draft: { ...EMPTY_SIGNUP_DRAFT }, hydrated: true });
  mocked.saveGuidedSignupStep.mockImplementation(async (_version, step, value) =>
    answer(signup({ version: 4, steps: { [step]: value }, nextStep: "shop" })),
  );
});

describe("step 0", () => {
  beforeEach(() => {
    mockSignedIn = false;
  });

  it("names every missing answer before anything is created", async () => {
    await render(<SignupStartStep />);
    await fireEvent.press(screen.getByRole("button", { name: /Start/ }));
    expect(screen.getByText("You must be 18 or older to open a shop on GRIDGO.")).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("tells a manager the owner claims the shop, then goes on to the sign-in", async () => {
    await render(<SignupStartStep />);
    await fireEvent.press(screen.getByText("I have a print shop"));
    await fireEvent.press(screen.getByText("I manage it for the owner"));
    expect(screen.getByText(/Your owner gets a link to claim it/)).toBeTruthy();
    await fireEvent.press(screen.getByText("I am 18 or older"));
    await fireEvent.press(screen.getByRole("button", { name: /Start/ }));
    expect(mockRouter.push).toHaveBeenCalledWith("/(auth)/signup/account");
    expect(useSignupDraft.getState().draft.eligibility).toEqual({
      shopKind: "print_shop",
      registrantRole: "manager",
      adult: true,
    });
  });
});

describe("a GRIDGO without guided sign-up", () => {
  it("keeps today's sign-up: a signed-in shop resumes its older steps where it left them", async () => {
    mocked.getGuidedSignup.mockRejectedValue(new api.ApiError(404, { error: "not_found" }));
    useSignupDraft.setState({
      draft: {
        ...EMPTY_SIGNUP_DRAFT,
        shopName: "Corner Prints",
        contactName: "Test Owner",
        email: "shop@example.com",
        phone: "09170000265",
      },
      hydrated: true,
    });
    await render(<SignupStartStep />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/(auth)/signup/location"));
    expect(mocked.saveGuidedSignupStep).not.toHaveBeenCalled();
  });
});

describe("the missions map", () => {
  it("lights the next step GRIDGO names and opens it", async () => {
    givenSignup(signup({ steps: { eligibility: ELIGIBILITY }, nextStep: "shop" }));
    await render(<SignupMissionsScreen />);
    await waitFor(() => expect(screen.getByText("0 of 6 done · about 5 min left")).toBeTruthy());
    await fireEvent.press(screen.getByRole("button", { name: /Continue: Your shop/ }));
    expect(mockRouter.push).toHaveBeenCalledWith("/(auth)/signup/your-shop");
  });

  it("resumes at the first unfinished step", async () => {
    givenSignup(
      signup({
        steps: { eligibility: ELIGIBILITY, shop: SHOP },
        nextStep: "location",
      }),
    );
    await render(<SignupMissionsScreen />);
    await waitFor(() => expect(screen.getByText("1 of 6 done · about 4 min left")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Continue: Pin your shop/ })).toBeTruthy();
  });
});

describe("your shop", () => {
  it("will not save a mobile that has not been confirmed by code", async () => {
    givenSignup(signup({ steps: { eligibility: ELIGIBILITY }, nextStep: "shop" }));
    mockClerkUser = { phoneNumbers: [], createPhoneNumber: jest.fn() };
    useSignupDraft.setState({
      draft: { ...EMPTY_SIGNUP_DRAFT, shopName: "Corner Prints", contactName: "Test Owner", phone: "0917 000 0265" },
      hydrated: true,
    });
    await render(<SignupYourShopStep />);
    await fireEvent.press(screen.getByRole("button", { name: /Save/ }));
    expect(screen.getByText("Confirm this number with the code we text you.")).toBeTruthy();
    expect(mocked.saveGuidedSignupStep).not.toHaveBeenCalled();
  });

  it("saves the shop once Clerk has the number confirmed", async () => {
    givenSignup(signup({ steps: { eligibility: ELIGIBILITY }, nextStep: "shop" }));
    mockClerkUser = verifiedClerkUser("+639170000265");
    useSignupDraft.setState({
      draft: { ...EMPTY_SIGNUP_DRAFT, shopName: "Corner Prints", contactName: "Test Owner", phone: "0917 000 0265" },
      hydrated: true,
    });
    await render(<SignupYourShopStep />);
    expect(screen.getByText("Number confirmed")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /Save/ }));
    await waitFor(() =>
      expect(mocked.saveGuidedSignupStep).toHaveBeenCalledWith(3, "shop", {
        shopName: "Corner Prints",
        contactName: "Test Owner",
        phone: "+639170000265",
      }),
    );
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("asks a manager for the owner's mobile", async () => {
    givenSignup(
      signup({ steps: { eligibility: { ...ELIGIBILITY, registrantRole: "manager" } }, nextStep: "shop" }),
    );
    mockClerkUser = verifiedClerkUser("+639170000265");
    useSignupDraft.setState({
      draft: { ...EMPTY_SIGNUP_DRAFT, shopName: "Corner Prints", contactName: "Test Manager", phone: "09170000265" },
      hydrated: true,
    });
    await render(<SignupYourShopStep />);
    await fireEvent.press(screen.getByRole("button", { name: /Save/ }));
    expect(screen.getByText("Enter your owner's mobile number, like 0917 123 4567.")).toBeTruthy();
    expect(mocked.saveGuidedSignupStep).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText("Owner's mobile"), "0917 111 2265");
    await fireEvent.press(screen.getByRole("button", { name: /Save/ }));
    await waitFor(() =>
      expect(mocked.saveGuidedSignupStep).toHaveBeenCalledWith(
        3,
        "shop",
        expect.objectContaining({ ownerPhone: "+639171112265" }),
      ),
    );
  });
});

describe("the pin", () => {
  const PIN = { lat: 7.07, lng: 125.61, label: "Bajada, Davao City" };

  it("draws GRIDGO's consent word for word and needs it ticked", async () => {
    givenSignup(signup({ steps: { eligibility: ELIGIBILITY, shop: SHOP }, nextStep: "location" }));
    useSignupDraft.setState({ draft: { ...EMPTY_SIGNUP_DRAFT, pin: PIN }, hydrated: true });
    await render(<SignupPinStep />);
    await fireEvent.press(screen.getByRole("button", { name: /Use this pin/ }));
    expect(screen.getByText("Tick the box to let GRIDGO use your pin.")).toBeTruthy();
    expect(mocked.saveGuidedSignupStep).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText(TERMS.locationConsentWording));
    await fireEvent.press(screen.getByRole("button", { name: /Use this pin/ }));
    await waitFor(() =>
      expect(mocked.saveGuidedSignupStep).toHaveBeenCalledWith(
        3,
        "location",
        expect.objectContaining({
          consent: { accepted: true, wording: TERMS.locationConsentWording },
        }),
      ),
    );
  });
});

describe("what the shop prints", () => {
  beforeEach(() => {
    givenSignup(
      signup({ steps: { eligibility: ELIGIBILITY, shop: SHOP }, nextStep: "prints" }),
    );
  });

  it("starts with documents ticked and shows GRIDGO's page price read-only", async () => {
    await render(<SignupPrintsStep />);
    expect(screen.getByText("₱3.00 a side")).toBeTruthy();
    expect(screen.getByText("₱5.00 a side")).toBeTruthy();
    expect(screen.queryByLabelText(/Black & white price per side/)).toBeNull();
    expect(screen.getByText("Express is on")).toBeTruthy();
  });

  it("asks for the shop's own A3 prices once A3 is ticked", async () => {
    await render(<SignupPrintsStep />);
    await fireEvent.press(screen.getByText("A3"));
    await fireEvent.press(screen.getByRole("button", { name: /Save/ }));
    expect(mocked.saveGuidedSignupStep).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText("A3 Black & white price per side"), "12");
    await fireEvent.changeText(screen.getByLabelText("A3 Colour price per side"), "25");
    await fireEvent.press(screen.getByRole("button", { name: /Save/ }));
    await waitFor(() =>
      expect(mocked.saveGuidedSignupStep).toHaveBeenCalledWith(
        3,
        "prints",
        expect.objectContaining({
          documents: expect.objectContaining({
            papers: ["short", "a4", "long", "a3"],
            a3PricesMinor: { bw: 1200, colour: 2500 },
          }),
        }),
      ),
    );
  });
});

describe("who takes jobs, and opening the shop", () => {
  const enrollSupplier = jest.fn();

  beforeEach(() => {
    givenSignup(
      signup({
        steps: {
          eligibility: ELIGIBILITY,
          shop: SHOP,
          location: { point: { lat: 7, lng: 125, label: "Bajada, Davao City" } },
          prints: { groups: ["documents"] },
        },
        nextStep: "enroll",
      }),
    );
    mocked.listLegalDocuments.mockRejectedValue(new api.ApiError(404, { error: "not_found" }));
    useLegalLibrary.setState({ documents: [], status: "idle", readAt: null });
    useSession.setState({ enrollSupplier, error: null });
    enrollSupplier.mockResolvedValue(true);
  });

  it("opens the shop by naming the saved draft, not repeating it", async () => {
    await render(<SignupOpenShopStep />);
    await waitFor(() => expect(useLegalLibrary.getState().status).toBe("unsupported"));
    await fireEvent.press(screen.getByText("Me and staff"));
    await fireEvent.press(screen.getByRole("button", { name: /Open my shop/ }));
    await waitFor(() =>
      expect(enrollSupplier).toHaveBeenCalledWith(
        { signupVersion: 3, jobsHandledBy: "me_and_staff" },
        expect.any(String),
      ),
    );
    expect(mockRouter.replace).toHaveBeenCalledWith("/setup");
  });

  it("says what to fix when the agreement is not ticked", async () => {
    mocked.listLegalDocuments.mockResolvedValue([]);
    await render(<SignupOpenShopStep />);
    await fireEvent.press(screen.getByRole("button", { name: /Open my shop/ }));
    expect(screen.getByText("Tick the agreement below to open your shop.")).toBeTruthy();
    expect(enrollSupplier).not.toHaveBeenCalled();
  });
});
