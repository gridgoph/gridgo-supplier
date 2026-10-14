import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SupportChatConversation } from "@/components/SupportChatConversation";

/**
 * gridgo-client#231: a tapped support push can name a thread that has since
 * been removed or is not this shop's. The screen says so and leads to chat
 * history, rather than an error beside a composer that would post into nothing.
 */

const THREAD = "0b9a1f2c-3d4e-4f5a-8b6c-7d8e9f0a1b2c";
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
}));

jest.mock("@/lib/api", () => {
  const { ApiError } = jest.requireActual("@/lib/apiErrors");
  return {
    ApiError,
    getSupportChatMe: jest.fn(),
    markSupportChatRead: jest.fn(),
    getSupportChatThread: jest.fn(async () => {
      throw new ApiError(404, { error: "support_chat_thread_not_found" });
    }),
    sendSupportChatMessage: jest.fn(),
  };
});

jest.mock("@/lib/supportChatStream", () => ({
  openSupportChatStream: () => ({ close: jest.fn() }),
}));

it("says a removed conversation is gone and offers chat history instead of a composer", async () => {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 412, height: 915 },
        insets: { top: 48, left: 0, right: 0, bottom: 48 },
      }}
    >
      <SupportChatConversation threadId={THREAD} />
    </SafeAreaProvider>,
  );

  expect(await screen.findByText("This conversation is no longer available")).toBeTruthy();
  expect(screen.queryByLabelText("Message Operations")).toBeNull();
  expect(screen.queryByLabelText("Conversation details")).toBeNull();
  fireEvent.press(screen.getByText("Open chat history"));
  expect(mockReplace).toHaveBeenCalledWith("/chat");
});
