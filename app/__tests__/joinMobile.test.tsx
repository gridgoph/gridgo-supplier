import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockSignUp = {
  status: "missing_requirements",
  unverifiedFields: ["phone_number"],
  missingFields: [] as string[],
  existingSession: null,
  create: jest.fn(async () => ({ error: null })),
  password: jest.fn(async () => ({ error: null })),
  finalize: jest.fn(async () => ({ error: null })),
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
jest.mock("@clerk/expo", () => ({
  useSignUp: () => ({ signUp: mockSignUp }),
  useClerk: () => ({ setActive: jest.fn() }),
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
}));

import { router } from "expo-router";
import JoinAccountScreen from "@/app/(auth)/join-account";
import { useTeamJoin } from "@/store/teamJoin";

const TOKEN = "tokenTOKENtoken_tokenTOKENtoken_tokenTOKEN1";

beforeEach(() => {
  jest.clearAllMocks();
  mockSignUp.status = "missing_requirements";
  useTeamJoin.getState().clear();
});

describe("a new person joining by link or QR", () => {
  it("makes a login with their name and mobile, verified by a texted 6-digit code", async () => {
    useTeamJoin.getState().holdToken(TOKEN);
    await render(<JoinAccountScreen />);
    expect(screen.queryByLabelText("Email")).toBeNull();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Your name"), "Lito Cruz");
      fireEvent.changeText(screen.getByLabelText("Your mobile"), "0915 123 7781");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Send my code"));
    });
    expect(mockSignUp.create).toHaveBeenCalledWith({ phoneNumber: "+639151237781", firstName: "Lito", lastName: "Cruz" });
    expect(mockSignUp.verifications.sendPhoneCode).toHaveBeenCalled();
    expect(screen.getByText("Check your texts")).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("6-digit code"), "482113");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Verify my number"));
    });
    expect(mockSignUp.verifications.verifyPhoneCode).toHaveBeenCalledWith({ code: "482113" });
    expect(mockSignUp.finalize).toHaveBeenCalled();
    // The join screen claims next, naming the new person with what they typed.
    expect(useTeamJoin.getState().name).toBe("Lito Cruz");
    expect(useTeamJoin.getState().token).toBe(TOKEN);
    expect(router.dismissTo).toHaveBeenCalledWith("/join-team");
  });

  it("refuses a number it cannot read before asking Clerk for anything", async () => {
    useTeamJoin.getState().holdToken(TOKEN);
    await render(<JoinAccountScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Your name"), "Lito");
      fireEvent.changeText(screen.getByLabelText("Your mobile"), "12");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Send my code"));
    });
    expect(mockSignUp.create).not.toHaveBeenCalled();
    expect(screen.getByText(/Check the number/)).toBeTruthy();
  });

  it("keeps the email login for an email invite", async () => {
    await render(<JoinAccountScreen />);
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByLabelText("Your mobile")).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText("Join with my mobile instead"));
    });
    expect(screen.getByLabelText("Your mobile")).toBeTruthy();
  });
});
