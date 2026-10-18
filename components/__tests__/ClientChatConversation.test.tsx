import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ClientChatConversation } from "@/components/ClientChatConversation";
import * as api from "@/lib/api";
import { uploadChatFile } from "@/lib/chatImages";
import { askPick } from "@/store/sheets";

/**
 * The shop's side of the masked conversation with the client (gridgo-client#246):
 * GRIDGO's masking is shown as it came, the shop is told kindly when its own
 * message lost a contact, every message from the others can be reported, and
 * a closed conversation offers no composer.
 */

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("react").useEffect(effect, []);
  },
}));

jest.mock("react-native-keyboard-controller", () => {
  const { View } = require("react-native");
  return { KeyboardAvoidingView: (props: Record<string, unknown>) => <View {...props} /> };
});

jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: jest.fn() }));

jest.mock("@/components/Screen", () => {
  const { View } = require("react-native");
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

jest.mock("@/lib/api", () => ({
  getClientChat: jest.fn(),
  sendClientChatMessage: jest.fn(),
  reportClientChatMessage: jest.fn(async () => undefined),
  getDownloadUrl: jest.fn(async () => ({ url: "https://example.test/file" })),
}));

jest.mock("@/lib/chatImages", () => ({
  pickChatImages: jest.fn(async () => [
    { uri: "file:///shop-front.jpg", name: "shop-front.jpg", mimeType: "image/jpeg", size: 2048 },
  ]),
  uploadChatFile: jest.fn(async () => "file_up_1"),
}));

jest.mock("@/store/sheets", () => ({ askPick: jest.fn() }));

const at = "2026-10-17T04:00:00.000Z";
const openChat = { status: "open", closesAt: null, unread: 1, warned: false } as const;

function thread(messages: unknown[], chat: Record<string, unknown> = openChat) {
  return { chat, messages, nextAfter: null };
}

beforeEach(() => jest.clearAllMocks());

it("shows masked text as GRIDGO sent it, labels nobody by name, and explains the shop's own hidden contact", async () => {
  jest.mocked(api.getClientChat).mockResolvedValue(
    thread([
      { id: "m1", senderLabel: "Client", body: "Can you do it in A4?", mine: false, createdAt: at, attachments: [] },
      { id: "m2", senderLabel: "Print shop", body: "Call [contact hidden]", mine: true, createdAt: at, attachments: [] },
      { id: "m3", senderLabel: "GRIDGO", body: "Please keep it here.", mine: false, createdAt: at, attachments: [] },
    ]) as never,
  );
  await render(<ClientChatConversation orderId="ord_1" onOpenJob={jest.fn()} />);

  expect(await screen.findByText("Call [contact hidden]")).toBeTruthy();
  expect(screen.getByTestId("contact-hidden-note")).toBeTruthy();
  expect(screen.getByText(/^Client · /)).toBeTruthy();
  expect(screen.getByText(/^Print shop · /)).toBeTruthy();
  expect(screen.getByText(/^GRIDGO · /)).toBeTruthy();
  // Report on each message from the others, not on the shop's own.
  expect(screen.getByLabelText("Report this message from Client")).toBeTruthy();
  expect(screen.getByLabelText("Report this message from GRIDGO")).toBeTruthy();
  expect(screen.queryByLabelText("Report this message from Print shop")).toBeNull();
  // The one unread message gets the line above it.
  expect(screen.getByText("New messages")).toBeTruthy();
  // Price, spec and deadline go through the job, said beside the composer.
  expect(screen.getByTestId("client-chat-changes-note")).toBeTruthy();
});

it("reports a message with the reason the shop picks, then says it was reported", async () => {
  jest.mocked(api.getClientChat).mockResolvedValue(
    thread([{ id: "m1", senderLabel: "Client", body: "Message me on [contact hidden]", mine: false, createdAt: at, attachments: [] }]) as never,
  );
  jest.mocked(askPick).mockResolvedValue("contact_sharing");
  await render(<ClientChatConversation orderId="ord_1" onOpenJob={jest.fn()} />);

  await fireEvent.press(await screen.findByLabelText("Report this message from Client"));

  expect(api.reportClientChatMessage).toHaveBeenCalledWith("ord_1", "m1", "contact_sharing");
  expect(await screen.findByText("· Reported")).toBeTruthy();
});

it("sends a photo with the conversation's own purpose, so GRIDGO strips its details", async () => {
  jest.mocked(api.getClientChat).mockResolvedValue(thread([]) as never);
  jest.mocked(askPick).mockResolvedValue("photo");
  jest.mocked(api.sendClientChatMessage).mockResolvedValue({
    chat: { ...openChat, unread: 0 },
    message: { id: "m9", senderLabel: "Print shop", body: "Our proof", mine: true, createdAt: at, attachments: [] },
  });
  await render(<ClientChatConversation orderId="ord_1" onOpenJob={jest.fn()} />);
  await screen.findByText("No messages yet");

  await fireEvent.press(screen.getByLabelText("Attach a photo or PDF"));
  await fireEvent.changeText(screen.getByLabelText("Message the client"), "Our proof");
  await fireEvent.press(screen.getByLabelText("Send"));

  expect(uploadChatFile).toHaveBeenCalledWith(
    expect.objectContaining({ uri: "file:///shop-front.jpg", mimeType: "image/jpeg" }),
    "client_shop_chat_attachment",
  );
  expect(api.sendClientChatMessage).toHaveBeenCalledWith("ord_1", "Our proof", ["file_up_1"]);
  expect(await screen.findByText("Our proof")).toBeTruthy();
});

it("warns calmly once GRIDGO has flagged repeated contact sharing", async () => {
  jest.mocked(api.getClientChat).mockResolvedValue(thread([], { ...openChat, warned: true }) as never);
  await render(<ClientChatConversation orderId="ord_1" onOpenJob={jest.fn()} />);
  expect(await screen.findByTestId("client-chat-warning")).toBeTruthy();
});

it("offers no composer once the conversation has closed, and keeps the history", async () => {
  jest.mocked(api.getClientChat).mockResolvedValue(
    thread([{ id: "m1", senderLabel: "Client", body: "Thanks!", mine: false, createdAt: at, attachments: [] }], {
      status: "read_only",
      closesAt: at,
      unread: 0,
      warned: false,
    }) as never,
  );
  const onOpenJob = jest.fn();
  await render(<ClientChatConversation orderId="ord_1" onOpenJob={onOpenJob} />);
  expect(await screen.findByText("Thanks!")).toBeTruthy();
  expect(screen.queryByLabelText("Message the client")).toBeNull();
  // A closed conversation can still be reported.
  expect(screen.getByLabelText("Report this message from Client")).toBeTruthy();
  await fireEvent.press(screen.getByText("Back to the job"));
  expect(onOpenJob).toHaveBeenCalled();
});

it("reads only what came after the last message on the next refresh", async () => {
  jest.mocked(api.getClientChat).mockResolvedValue(
    thread([{ id: "m1", senderLabel: "Client", body: "First", mine: false, createdAt: at, attachments: [] }]) as never,
  );
  jest.useFakeTimers();
  try {
    await render(<ClientChatConversation orderId="ord_1" onOpenJob={jest.fn()} />);
    await waitFor(() => expect(api.getClientChat).toHaveBeenCalledWith("ord_1", null));
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(api.getClientChat).toHaveBeenLastCalledWith("ord_1", "m1");
  } finally {
    jest.useRealTimers();
  }
});
