import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SupplierChatScreen from "@/app/chat";

const mockGetSupportChatMe = jest.fn(async (..._args: unknown[]) => ({ thread: null, messages: [] }));
const mockSendSupportChatMessage = jest.fn();

jest.mock("react-native-keyboard-controller", () => {
  const { View } = require("react-native");
  return { KeyboardAvoidingView: View };
});

jest.mock("@/lib/api", () => ({
  getSupportChatMe: (...args: unknown[]) => mockGetSupportChatMe(...args),
  sendSupportChatMessage: (...args: unknown[]) => mockSendSupportChatMessage(...args),
  markSupportChatRead: jest.fn(async () => ({ thread: null })),
}));

jest.mock("@/lib/supportChatStream", () => ({
  openSupportChatStream: () => ({ close: jest.fn() }),
}));

function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

describe("supplier chat", () => {
  it("opens a live Operations thread", async () => {
    await renderInSafeArea(<SupplierChatScreen />);
    expect(await screen.findByText("Operations")).toBeTruthy();
    expect(screen.getByText("No messages yet")).toBeTruthy();
    expect(screen.getByLabelText("Message Operations")).toBeTruthy();
  });

  it("sends to Operations", async () => {
    mockSendSupportChatMessage.mockResolvedValue({
      thread: { id: "t1", unreadCount: 0 },
      message: {
        id: "m1",
        threadId: "t1",
        senderUserId: "shop",
        senderRole: "supplier",
        body: "Where is the payout?",
        createdAt: "2026-09-20T03:00:00.000Z",
        mine: true,
      },
    });
    await renderInSafeArea(<SupplierChatScreen />);
    await screen.findByText("Operations");
    fireEvent.changeText(screen.getByPlaceholderText("Write to Operations"), "Where is the payout?");
    await screen.findByDisplayValue("Where is the payout?");
    fireEvent.press(screen.getByLabelText("Send"));
    await waitFor(() => {
      expect(mockSendSupportChatMessage).toHaveBeenCalledWith("Where is the payout?");
    });
  });
});
