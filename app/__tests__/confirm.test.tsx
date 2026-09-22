import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

const mockNavigation = {
  addListener: jest.fn(() => jest.fn()),
};

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => mockNavigation,
}));

import { router } from "expo-router";

import ConfirmSheet from "@/app/confirm";
import { askConfirm, useSheets } from "@/store/sheets";

const request = {
  question: "Remove “Tarpaulin, 13oz” from your shop?",
  consequence: "It comes off your board.",
  confirmLabel: "Remove it",
  cancelLabel: "Keep it",
  destructive: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSheets.setState({ confirm: null, date: null, pick: null });
});

describe("Confirm sheet", () => {
  it("does not treat a remount as a decline", async () => {
    const previous = Platform.OS;
    Platform.OS = "web";
    try {
      const pending = askConfirm(request);

      const first = await render(<ConfirmSheet />);
      await first.unmount();

      await render(<ConfirmSheet />);
      await fireEvent.press(screen.getByRole("button", { name: "Remove it" }));

      await expect(pending).resolves.toBe(true);
      expect(router.back).toHaveBeenCalled();
    } finally {
      Platform.OS = previous;
    }
  });
});
