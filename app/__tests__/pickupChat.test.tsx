import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import PickupChatScreen from "@/app/job/[id]/messages";
import { getDownloadUrl, getPickupChat, sendPickupMessage } from "@/lib/api";
import { ApiError } from "@/lib/apiErrors";
import { pickChatImages, uploadChatImage } from "@/lib/chatImages";
import type { PickupChatMessage, PickupChatSummary } from "@/lib/pickupChat";
import { useViewing } from "@/store/toasts";

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
  useLocalSearchParams: () => ({ id: "ord_1" }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(effect, [effect]);
  },
  Stack: { Screen: () => null },
}));

jest.mock("react-native-keyboard-controller", () => {
  const { View } = jest.requireActual("react-native");
  return { KeyboardAvoidingView: View };
});

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getPickupChat: jest.fn(),
  sendPickupMessage: jest.fn(),
  getDownloadUrl: jest.fn(),
}));

jest.mock("@/lib/chatImages", () => ({
  ...jest.requireActual("@/lib/chatImages"),
  pickChatImages: jest.fn(),
  uploadChatImage: jest.fn(),
}));

const OPEN: PickupChatSummary = { status: "open", unread: 0, closesAt: null, retentionHours: 24, riderFirstName: "Jun" };
const FROM_RIDER: PickupChatMessage = {
  id: "msg_1",
  senderRole: "rider",
  body: "Ten minutes away. Which gate?",
  attachments: [],
  createdAt: "2026-10-08T06:00:00.000Z",
  mine: false,
};

beforeEach(() => {
  jest.mocked(getDownloadUrl).mockImplementation(async (fileId: string) => ({
    fileId,
    url: `https://example.test/${fileId}.jpg`,
    expiresAt: "2099-01-01T00:00:00.000Z",
    expiresInSeconds: 300,
  }));
});

afterEach(() => {
  jest.resetAllMocks();
  mockCanGoBack = true;
});

async function renderChat() {
  await render(<PickupChatScreen />);
  await act(async () => {});
}

describe("pickup chat screen", () => {
  it("shows the rider's messages under their first name and what the shop may expect", async () => {
    jest.mocked(getPickupChat).mockResolvedValue({ chat: OPEN, messages: [FROM_RIDER] });
    await renderChat();

    expect(await screen.findByText("Ten minutes away. Which gate?")).toBeTruthy();
    expect(screen.getByText("Jun")).toBeTruthy();
    expect(screen.getByText("Collecting this job")).toBeTruthy();
    expect(screen.getByText(/Only your shop and Jun see these messages/)).toBeTruthy();
    expect(screen.getByLabelText("Message Jun")).toBeTruthy();
    expect(getPickupChat).toHaveBeenCalledWith("ord_1");
    // A notice about this job must not toast over its own conversation.
    expect(useViewing.getState().orderId).toBe("ord_1");
  });

  it("sends a message and puts it in the transcript", async () => {
    jest.mocked(getPickupChat).mockResolvedValue({ chat: OPEN, messages: [] });
    jest.mocked(sendPickupMessage).mockResolvedValue({
      chat: OPEN,
      message: { id: "msg_2", senderRole: "supplier", body: "Blue gate", createdAt: "2026-10-08T06:01:00.000Z", mine: true },
    });
    await renderChat();
    expect(await screen.findByText("No messages yet")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Message Jun"), "Blue gate");
    await act(async () => {
      await fireEvent.press(screen.getByLabelText("Send"));
    });

    expect(sendPickupMessage).toHaveBeenCalledWith("ord_1", "Blue gate");
    expect(await screen.findByText("Blue gate")).toBeTruthy();
    expect(screen.getByText(/^Your shop · /)).toBeTruthy();
  });

  it("uploads photos as pick-up chat images, up to four", async () => {
    jest.mocked(getPickupChat).mockResolvedValue({ chat: OPEN, messages: [] });
    jest.mocked(pickChatImages).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ uri: `file:///p${i}.jpg`, name: `p${i}.jpg`, mimeType: "image/jpeg", size: 1000 })),
    );
    await renderChat();
    await screen.findByText("No messages yet");

    await act(async () => {
      await fireEvent.press(screen.getByLabelText("Add photos"));
    });
    expect(screen.getByText("A message can include up to 4 photos.")).toBeTruthy();

    jest.mocked(pickChatImages).mockResolvedValue([
      { uri: "file:///front.jpg", name: "front.jpg", mimeType: "image/jpeg", size: 1000 },
    ]);
    jest.mocked(uploadChatImage).mockResolvedValue("file_front");
    jest.mocked(sendPickupMessage).mockResolvedValue({
      chat: OPEN,
      message: { id: "msg_3", senderRole: "supplier", body: "", attachments: [{ fileId: "file_front" }], createdAt: "2026-10-08T06:02:00.000Z", mine: true },
    });
    await act(async () => {
      await fireEvent.press(screen.getByLabelText("Add photos"));
    });
    expect(screen.getByLabelText("Remove front.jpg")).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByLabelText("Send"));
    });

    expect(uploadChatImage).toHaveBeenCalledWith(
      { uri: "file:///front.jpg", name: "front.jpg", mimeType: "image/jpeg" },
      "pickup_chat_image",
    );
    expect(sendPickupMessage).toHaveBeenCalledWith("ord_1", "", { attachmentFileIds: ["file_front"] });
  });

  it("is read-only after delivery: no composer, and says when it goes", async () => {
    jest.mocked(getPickupChat).mockResolvedValue({
      chat: { ...OPEN, status: "read_only", closesAt: "2026-10-09T02:00:00.000Z" },
      messages: [FROM_RIDER],
    });
    await renderChat();

    expect(await screen.findByText(/This job has been delivered, so no new messages can be sent/)).toBeTruthy();
    expect(screen.getByText("Delivered")).toBeTruthy();
    expect(screen.queryByLabelText("Message Jun")).toBeNull();
    await fireEvent.press(screen.getByText("Back to the job"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("says a removed conversation is gone, and never shows the code", async () => {
    jest.mocked(getPickupChat).mockRejectedValue(new ApiError(410, { error: "pickup_chat_closed" }));
    mockCanGoBack = false;
    await renderChat();

    expect(await screen.findByText("These messages were removed")).toBeTruthy();
    expect(screen.queryByText(/pickup_chat/)).toBeNull();
    await fireEvent.press(screen.getByText("Back to the job"));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/job/[id]", params: { id: "ord_1" } });
  });

  it("explains a refused send in words and re-reads the window", async () => {
    jest.mocked(getPickupChat).mockResolvedValue({ chat: OPEN, messages: [] });
    jest.mocked(sendPickupMessage).mockRejectedValue(new ApiError(409, { error: "pickup_chat_read_only" }));
    await renderChat();
    await screen.findByText("No messages yet");

    await fireEvent.changeText(screen.getByLabelText("Message Jun"), "Still there?");
    await act(async () => {
      await fireEvent.press(screen.getByLabelText("Send"));
    });
    await waitFor(() =>
      expect(screen.getByText("This job has been delivered, so no new messages can be sent.")).toBeTruthy(),
    );
    expect(getPickupChat).toHaveBeenCalledTimes(2);
  });
});
