import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: () => undefined,
}));

const mockClerkUser = {
  createEmailAddress: jest.fn(),
  update: jest.fn(async () => undefined),
  reload: jest.fn(async () => undefined),
};
jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: mockClerkUser }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import ChangeEmailScreen from "@/app/change-email";
import { router } from "expo-router";
import { useSession } from "@/store/session";

const shop = {
  id: "u1",
  email: "old@example.com",
  name: "Ben Santos",
  role: "supplier" as const,
  supplierName: "Lovis Print Shop",
  verificationStatus: "approved" as const,
};

/** A Clerk refusal, in the shape Clerk actually throws. */
function clerkError(code: string, message = "That email address is taken.") {
  return { errors: [{ code, message, longMessage: message }] };
}

function pendingAddress() {
  return {
    id: "idn_1",
    emailAddress: "new@example.com",
    prepareVerification: jest.fn(async () => undefined),
    attemptVerification: jest.fn(async () => undefined),
  };
}

/** What `refresh()` leaves on the session — GRIDGO's copy, after the change. */
function refreshLands(email: string) {
  return jest.fn(async () => {
    useSession.setState({ user: { ...shop, email } });
  });
}

async function typeAddress(value: string) {
  await fireEvent.changeText(await screen.findByLabelText("New email address"), value);
  await fireEvent.press(screen.getByRole("button", { name: "Send the code" }));
}

async function answerCode(digits: string) {
  await fireEvent.changeText(await screen.findByLabelText("6-digit job number"), digits);
  await fireEvent.press(screen.getByRole("button", { name: "Use this address" }));
}

describe("changing the address a shop signs in with", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({
      user: shop,
      loading: false,
      error: null,
      authSource: "clerk",
      identity: { kind: "supplier" },
      refresh: refreshLands("new@example.com"),
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

  it("claims the address, takes the code, and closes when both sides agree", async () => {
    const address = pendingAddress();
    mockClerkUser.createEmailAddress.mockResolvedValue(address);

    view = await render(<ChangeEmailScreen />);

    await typeAddress("new@example.com");

    expect(mockClerkUser.createEmailAddress).toHaveBeenCalledWith({ email: "new@example.com" });
    expect(await screen.findByText(/new@example.com/)).toBeTruthy();

    await answerCode("123456");

    await waitFor(() =>
      expect(mockClerkUser.update).toHaveBeenCalledWith({ primaryEmailAddressId: "idn_1" }),
    );
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  /**
   * The captain's rule: do not retry, do not steal. Nothing is claimed and the
   * shop is left on the field it typed into, with the two real ways out.
   */
  it("says plainly when the address already has a GRIDGO sign-in", async () => {
    mockClerkUser.createEmailAddress.mockRejectedValue(clerkError("form_identifier_exists"));

    view = await render(<ChangeEmailScreen />);

    await typeAddress("taken@example.com");

    expect(await screen.findByText(/already has a GRIDGO sign-in/)).toBeTruthy();
    expect(screen.getByText(/sign in with the account that owns it/)).toBeTruthy();
    expect(mockClerkUser.update).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  /**
   * The ending this screen exists for. Clerk moved and GRIDGO did not, because
   * another shop's record already holds that address. Both facts are said, and
   * the next move goes to Operations rather than to a retry.
   */
  it("names both addresses when GRIDGO keeps its own", async () => {
    const address = pendingAddress();
    mockClerkUser.createEmailAddress.mockResolvedValue(address);
    // GRIDGO left its copy alone, so the account still reads the old address.
    useSession.setState({ refresh: refreshLands("old@example.com") });

    view = await render(<ChangeEmailScreen />);

    await typeAddress("new@example.com");
    await answerCode("123456");

    expect(await screen.findByText(/copy did not/)).toBeTruthy();
    expect(screen.getByText(/Ask Operations/)).toBeTruthy();
    // Never closed as if it had worked.
    expect(router.back).not.toHaveBeenCalled();
  });

  /** The address it already has costs no round trip at all. */
  it("spends nothing on the address the shop already signs in with", async () => {
    view = await render(<ChangeEmailScreen />);

    await typeAddress("OLD@example.com");

    expect(mockClerkUser.createEmailAddress).not.toHaveBeenCalled();
    expect(await screen.findByText(/already the email on this shop/)).toBeTruthy();
  });
});
