import { act, fireEvent, render, screen } from "@testing-library/react-native";

/**
 * A small stand-in for Clerk: one login per mobile, a session that names it.
 * Signing up makes a login; signing in by phone code only ever finds one.
 */
const mockClerk = {
  users: new Map<string, string>(),
  session: null as string | null,
  pendingSignUpPhone: null as string | null,
  pendingSignInUser: null as string | null,
};

const mockSignUp = {
  status: "missing_requirements",
  unverifiedFields: ["phone_number"],
  missingFields: [] as string[],
  existingSession: null,
  create: jest.fn(async (params: { phoneNumber: string }) => {
    mockClerk.pendingSignUpPhone = params.phoneNumber;
    return { error: null };
  }),
  password: jest.fn(async () => ({ error: null })),
  finalize: jest.fn(async () => {
    const phone = mockClerk.pendingSignUpPhone!;
    const id = `user_${mockClerk.users.size + 1}`;
    mockClerk.users.set(phone, id);
    mockClerk.session = id;
    return { error: null };
  }),
  verifications: {
    sendPhoneCode: jest.fn(async () => ({ error: null })),
    verifyPhoneCode: jest.fn(async () => {
      mockSignUp.status = "complete";
      return { error: null };
    }),
    sendEmailCode: jest.fn(async () => ({ error: null })),
    verifyEmailCode: jest.fn(async () => ({ error: null })),
  },
};

const mockSignIn = {
  status: "needs_first_factor",
  phoneCode: {
    sendCode: jest.fn(async (params: { phoneNumber: string }) => {
      const id = mockClerk.users.get(params.phoneNumber);
      if (!id) return { error: { code: "form_identifier_not_found", message: "Couldn't find your account." } };
      mockClerk.pendingSignInUser = id;
      return { error: null };
    }),
    verifyCode: jest.fn(async () => {
      mockSignIn.status = "complete";
      return { error: null };
    }),
  },
  finalize: jest.fn(async () => {
    mockClerk.session = mockClerk.pendingSignInUser;
    return { error: null };
  }),
};

jest.mock("@clerk/expo", () => ({
  useSignUp: () => ({ signUp: mockSignUp }),
  useSignIn: () => ({ signIn: mockSignIn }),
  useClerk: () => ({ setActive: jest.fn(), signOut: jest.fn(async () => { mockClerk.session = null; }) }),
  useAuth: () => ({ getToken: async () => (mockClerk.session ? `jwt_${mockClerk.session}` : null) }),
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
}));

/** GRIDGO's side: the team membership lives on the Clerk login. */
const mockMemberships = new Map<string, { shopId: string; shopRole: "staff" }>();
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  me: jest.fn(async () => {
    const id = mockClerk.session;
    const member = id ? mockMemberships.get(id) : undefined;
    if (!id || !member) throw new (jest.requireActual("@/lib/api").ApiError)(401, { error: "identity_unmapped" });
    return {
      id: member.shopId,
      clerkUserId: id,
      email: null,
      name: "Lito Cruz",
      role: "supplier",
      verificationStatus: "approved",
      shopId: member.shopId,
      shopRole: member.shopRole,
    };
  }),
}));

import { router } from "expo-router";
import JoinAccountScreen from "@/app/(auth)/join-account";
import PhoneSignInScreen from "@/app/(auth)/phone-sign-in";
import * as api from "@/lib/api";
import { useSession } from "@/store/session";
import { useTeamJoin } from "@/store/teamJoin";

const TOKEN = "tokenTOKENtoken_tokenTOKENtoken_tokenTOKEN1";

async function signInByPhone(mobile: string) {
  await render(<PhoneSignInScreen />);
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText("Your mobile"), mobile);
  });
  await act(async () => {
    fireEvent.press(screen.getByText("Send my code"));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClerk.users.clear();
  mockClerk.session = null;
  mockMemberships.clear();
  mockSignUp.status = "missing_requirements";
  mockSignIn.status = "needs_first_factor";
  useTeamJoin.getState().clear();
  api.setTokenProvider(null);
});

describe("a teammate who joined with only a mobile", () => {
  it("signs back in with a texted code to the same login and the same team place", async () => {
    // Joins by link: a login made from a name and a mobile.
    useTeamJoin.getState().holdToken(TOKEN);
    await render(<JoinAccountScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Your name"), "Lito Cruz");
      fireEvent.changeText(screen.getByLabelText("Your mobile"), "0915 123 7781");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Send my code"));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("6-digit code"), "482113");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Verify my number"));
    });
    const joined = mockClerk.session!;
    expect(joined).toBe("user_1");
    // The join screen claims the invite; GRIDGO puts the login on the team.
    mockMemberships.set(joined, { shopId: "sup_shop", shopRole: "staff" });
    await act(async () => {
      screen.unmount();
    });
    useTeamJoin.getState().clear();

    // Signs out.
    mockClerk.session = null;

    // Comes back: the same number finds the same login.
    await signInByPhone("0915 123 7781");
    expect(mockSignIn.phoneCode.sendCode).toHaveBeenCalledWith({ phoneNumber: "+639151237781" });
    expect(screen.getByText("Check your texts")).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("6-digit code"), "771204");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Sign in"));
    });

    expect(mockSignIn.phoneCode.verifyCode).toHaveBeenCalledWith({ code: "771204" });
    expect(mockClerk.session).toBe(joined);
    expect(mockClerk.users.size).toBe(1);
    expect(mockSignUp.create).toHaveBeenCalledTimes(1);
    expect(useSession.getState().user?.shopId).toBe("sup_shop");
    expect(useSession.getState().user?.shopRole).toBe("staff");
    expect(router.replace).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("keeps a join in progress and carries on at the join screen", async () => {
    mockClerk.users.set("+639151237781", "user_7");
    mockMemberships.set("user_7", { shopId: "sup_other", shopRole: "staff" });
    useTeamJoin.getState().holdToken(TOKEN);
    await signInByPhone("0915 123 7781");
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("6-digit code"), "771204");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Sign in"));
    });
    expect(useTeamJoin.getState().token).toBe(TOKEN);
    expect(router.dismissTo).toHaveBeenCalledWith("/join-team");
    expect(mockSignUp.create).not.toHaveBeenCalled();
  });

  it("makes no login for a number Clerk does not know", async () => {
    await signInByPhone("0915 000 0000");
    expect(mockSignUp.create).not.toHaveBeenCalled();
    expect(mockClerk.users.size).toBe(0);
    expect(screen.queryByText("Check your texts")).toBeNull();
  });

  it("refuses a number it cannot read before asking Clerk", async () => {
    await signInByPhone("12");
    expect(mockSignIn.phoneCode.sendCode).not.toHaveBeenCalled();
    expect(screen.getByText(/Check the number/)).toBeTruthy();
  });
});
