import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ChatListScreen from "@/app/chat/index";
import ChatThreadScreen from "@/app/chat/[thread]";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockStackScreen = jest.fn((_props: { options?: unknown }) => null);
let mockParams: { thread?: string } = {};
let mockCanGoBack = true;

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  Stack: { Screen: (props: { options?: unknown }) => mockStackScreen(props) },
}));

jest.mock("react-native-keyboard-controller", () => {
  const { View } = require("react-native");
  return { KeyboardAvoidingView: View };
});

const mockGetSupportChatMe = jest.fn(async () => ({ thread: null, threads: [], messages: [], unreadCount: 0 }));
const mockGetSupportChatThread = jest.fn();
const mockOpenSupportChatThread = jest.fn();
const mockSendSupportChatMessage = jest.fn();
const mockMarkSupportChatRead = jest.fn(async () => ({ thread: null, unreadCount: 0 }));

jest.mock("@/lib/api", () => ({
  getSupportChatMe: (...args: unknown[]) => mockGetSupportChatMe(...args),
  getSupportChatThread: (...args: unknown[]) => mockGetSupportChatThread(...args),
  openSupportChatThread: (...args: unknown[]) => mockOpenSupportChatThread(...args),
  sendSupportChatMessage: (...args: unknown[]) => mockSendSupportChatMessage(...args),
  markSupportChatRead: (...args: unknown[]) => mockMarkSupportChatRead(...args),
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

const historyThread = {
  id: "2c1b0a9e-8d7c-4b3a-9f10-1234567890ab",
  partyUserId: "shop",
  partyRole: "supplier" as const,
  lastMessageAt: "2026-09-21T03:00:00.000Z",
  lastMessagePreview: "Where is the payout?",
  unreadCount: 1,
  createdAt: "2026-09-21T03:00:00.000Z",
  updatedAt: "2026-09-21T03:00:00.000Z",
};

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockStackScreen.mockClear();
  mockParams = {};
  mockCanGoBack = true;
  mockGetSupportChatMe.mockResolvedValue({ thread: null, threads: [], messages: [], unreadCount: 0 });
  mockOpenSupportChatThread.mockReset();
  mockGetSupportChatThread.mockReset();
});

describe("supplier chat history", () => {
  it("lists Operations conversations and a New chat control", async () => {
    mockGetSupportChatMe.mockResolvedValue({
      thread: historyThread,
      threads: [historyThread],
      messages: [],
      unreadCount: 1,
    });
    await renderInSafeArea(<ChatListScreen />);

    expect(await screen.findByText("Your conversations")).toBeTruthy();
    expect(screen.getByText("Where is the payout?")).toBeTruthy();
    expect(screen.getAllByLabelText("New chat").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Message Operations")).toBeNull();
  });

  it("opens a history row", async () => {
    mockGetSupportChatMe.mockResolvedValue({
      thread: historyThread,
      threads: [historyThread],
      messages: [],
      unreadCount: 1,
    });
    await renderInSafeArea(<ChatListScreen />);
    fireEvent.press(await screen.findByLabelText("Operations, Where is the payout?"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/chat/[thread]",
      params: { thread: historyThread.id },
    });
  });

  it("starts a new chat from the history screen", async () => {
    mockOpenSupportChatThread.mockResolvedValue({
      thread: {
        ...historyThread,
        id: "3d2c1b0a-9e8d-4c3b-8a21-234567890abc",
        lastMessageAt: null,
        lastMessagePreview: null,
        unreadCount: 0,
      },
    });
    await renderInSafeArea(<ChatListScreen />);
    fireEvent.press(await screen.findByLabelText("New chat"));
    await waitFor(() => {
      expect(mockOpenSupportChatThread).toHaveBeenCalled();
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/chat/[thread]",
      params: { thread: "3d2c1b0a-9e8d-4c3b-8a21-234567890abc" },
    });
  });
});

describe("a supplier chat thread route", () => {
  it("renders Operations when the peer is a live thread", async () => {
    mockParams = { thread: historyThread.id };
    mockGetSupportChatThread.mockResolvedValue({
      thread: historyThread,
      messages: [
        {
          id: "m1",
          threadId: historyThread.id,
          senderUserId: "shop",
          senderRole: "supplier",
          body: "Where is the payout?",
          createdAt: "2026-09-21T03:00:00.000Z",
          mine: true,
        },
      ],
    });
    await renderInSafeArea(<ChatThreadScreen />);
    expect(await screen.findByText("Where is the payout?")).toBeTruthy();
    expect(screen.getByLabelText("Message Operations")).toBeTruthy();
  });

  it("sends into that conversation", async () => {
    mockParams = { thread: historyThread.id };
    mockGetSupportChatThread.mockResolvedValue({
      thread: historyThread,
      messages: [],
    });
    mockSendSupportChatMessage.mockResolvedValue({
      thread: historyThread,
      message: {
        id: "m2",
        threadId: historyThread.id,
        senderUserId: "shop",
        senderRole: "supplier",
        body: "Where is the payout?",
        createdAt: "2026-09-21T03:01:00.000Z",
        mine: true,
      },
    });
    await renderInSafeArea(<ChatThreadScreen />);
    await screen.findByLabelText("Message Operations");
    fireEvent.changeText(screen.getByPlaceholderText("Write to Operations"), "Where is the payout?");
    await screen.findByDisplayValue("Where is the payout?");
    fireEvent.press(screen.getByLabelText("Send"));
    await waitFor(() => {
      expect(mockSendSupportChatMessage).toHaveBeenCalledWith("Where is the payout?", historyThread.id);
    });
  });

  it("answers a missing conversation instead of rendering a blank one", async () => {
    mockParams = { thread: "ops" };
    await renderInSafeArea(<ChatThreadScreen />);

    expect(screen.getByText("No such conversation")).toBeTruthy();
    fireEvent.press(screen.getByText("Open chat history"));
    expect(mockReplace).toHaveBeenCalledWith("/chat");
  });
});
