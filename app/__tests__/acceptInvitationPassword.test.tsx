import { fireEvent, render, screen } from "@testing-library/react-native";

const mockCreate = jest.fn(async () => ({ error: null }));

jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: () => ({ __clerk_ticket: "ticket_123" }),
}));

jest.mock("@clerk/expo", () => ({
  useSignUp: () => ({
    signUp: { create: mockCreate, finalize: jest.fn(async () => ({ error: null })) },
    fetchStatus: "idle",
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import AcceptInvitationScreen from "@/app/(auth)/accept-invitation";

/** Same rule, same words as apply's first step (gridgo-supplier#215). */
describe("accept invitation password", () => {
  it("states Clerk's minimum and does not send a shorter password", async () => {
    const view = await render(<AcceptInvitationScreen />);

    expect(screen.getByText("At least 15 characters.")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Your name"), "Ben Santos");
    await fireEvent.changeText(screen.getByLabelText("Choose a password"), "eight-ok");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "eight-ok");
    await fireEvent.press(screen.getByRole("button", { name: "Accept invitation" }));

    expect(await screen.findByText("Use at least 15 characters.")).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
    await view.unmount();
  });
});
