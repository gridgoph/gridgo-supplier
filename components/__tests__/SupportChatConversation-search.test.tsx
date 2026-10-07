import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SupportChatConversation } from "@/components/SupportChatConversation";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true }),
}));

jest.mock("react-native-keyboard-controller", () => {
  const { View } = require("react-native");
  return {
    KeyboardAvoidingView: (props: Record<string, unknown>) => (
      <View {...props} testID="chat-keyboard-surface" />
    ),
  };
});

jest.mock("@/lib/api", () => ({
  getSupportChatMe: jest.fn(async () => ({
    thread: { id: "t1" }, threads: [], messages: [], unreadCount: 0,
  })),
  getSupportChatThread: jest.fn(async () => ({ messages: [] })),
  markSupportChatRead: jest.fn(async () => ({ thread: null, unreadCount: 0 })),
}));

jest.mock("@/lib/supportChatStream", () => ({
  openSupportChatStream: () => ({ close: jest.fn() }),
}));

it("keeps conversation search inside the chat's header-offset keyboard surface", async () => {
  await render(
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 412, height: 915 },
      insets: { top: 48, left: 0, right: 0, bottom: 48 },
    }}>
      <HeaderHeightContext.Provider value={104}>
        <SupportChatConversation />
      </HeaderHeightContext.Provider>
    </SafeAreaProvider>,
  );
  await fireEvent.press(await screen.findByLabelText("Conversation details"));
  await fireEvent.press(await screen.findByLabelText("Search in conversation"));

  const surface = screen.getByTestId("chat-keyboard-surface");
  expect(surface.props.behavior).toBe("padding");
  expect(surface.props.keyboardVerticalOffset).toBe(104);
  expect(within(surface).getByLabelText("Search this chat")).toBeTruthy();
});
