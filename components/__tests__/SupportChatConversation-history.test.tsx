import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SupportChatConversation } from "@/components/SupportChatConversation";

/**
 * The other half of `SupportChatConversation.test.tsx`, in its own file because
 * a second test that fires events in one file renders empty.
 *
 * gridgoph/gridgo-client#128 (supplier half): on an Android phone, opening the keyboard in the
 * Operations chat hid the conversation and the message being typed. The
 * keyboard itself is native and cannot be raised in Jest, so these pin the two
 * things the screen has to hand the native side: the header offset the
 * avoiding view needs, and re-pinning the transcript to its newest message
 * when the keyboard shrinks it.
 */

const mockAvoidingProps = jest.fn();

jest.mock("react-native-keyboard-controller", () => {
  const { View } = require("react-native");
  return {
    KeyboardAvoidingView: (props: Record<string, unknown>) => {
      mockAvoidingProps(props);
      return <View {...props} />;
    },
  };
});

const mockMessages = Array.from({ length: 30 }, (_, index) => ({
  id: `m${index}`,
  threadId: "t1",
  senderUserId: index % 2 ? "ops" : "me",
  senderRole: index % 2 ? "ops_admin" : "supplier",
  body: `Message ${index}`,
  createdAt: "2026-09-28T03:00:00.000Z",
  mine: index % 2 === 0,
}));

jest.mock("@/lib/api", () => ({
  getSupportChatMe: jest.fn(async () => ({
    thread: { id: "t1" },
    threads: [],
    messages: mockMessages,
    unreadCount: 0,
  })),
  markSupportChatRead: jest.fn(async () => ({ thread: null, unreadCount: 0 })),
  sendSupportChatMessage: jest.fn(),
}));

jest.mock("@/lib/supportChatStream", () => ({
  openSupportChatStream: () => ({ close: jest.fn() }),
}));

const HEADER_HEIGHT = 104;

async function renderUnderHeader() {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 412, height: 915 },
        insets: { top: 48, left: 0, right: 0, bottom: 48 },
      }}
    >
      <HeaderHeightContext.Provider value={HEADER_HEIGHT}>
        <SupportChatConversation />
      </HeaderHeightContext.Provider>
    </SafeAreaProvider>,
  );
  await screen.findByText("Message 29");
  // Let the load finish marking the thread read before any event is fired.
  await act(async () => {});
}

function transcript() {
  return screen.getByTestId("support-chat-transcript");
}

async function layout(height: number) {
  await fireEvent(transcript(), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 380, height } },
  });
}

async function scrollTo(offsetY: number) {
  await fireEvent.scroll(transcript(), {
    nativeEvent: {
      contentOffset: { x: 0, y: offsetY },
      layoutMeasurement: { width: 380, height: 700 },
      contentSize: { width: 380, height: 2400 },
    },
  });
}

let scrollToEnd: jest.SpyInstance;

beforeEach(() => {
  mockAvoidingProps.mockClear();
  scrollToEnd = jest.spyOn(ScrollView.prototype, "scrollToEnd");
});

afterEach(() => {
  scrollToEnd.mockRestore();
});

it("leaves a reader who scrolled up into history where they are", async () => {
  await renderUnderHeader();
  await layout(700);
  await scrollTo(200);
  scrollToEnd.mockClear();

  await layout(380);

  expect(scrollToEnd).not.toHaveBeenCalled();
});
