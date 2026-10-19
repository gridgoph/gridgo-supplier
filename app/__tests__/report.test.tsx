import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import ReportProblemScreen from "@/app/report";
import * as api from "@/lib/api";

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args), back: () => mockBack() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  sendSupportChatMessage: jest.fn(),
}));
const mockPick = jest.fn();
const mockTake = jest.fn();
const mockUpload = jest.fn();
jest.mock("@/lib/chatImages", () => ({
  ...jest.requireActual("@/lib/chatImages"),
  pickChatImages: () => mockPick(),
  takeChatPhoto: () => mockTake(),
  uploadChatImage: (...args: unknown[]) => mockUpload(...args),
}));
jest.mock("@/lib/problemReport", () => ({
  ...jest.requireActual("@/lib/problemReport"),
  readProblemReportDevice: () => ({ appVersion: "1.0.42", device: "Android 15, Google Pixel 7" }),
}));

const THREAD = "5b8c1d2e-3f40-4a51-8b62-7c83d94e05f6";

function shots(...names: string[]) {
  return names.map((name) => ({ uri: `file:///cache/${name}`, name, mimeType: "image/png", size: 2048 }));
}

beforeEach(() => {
  mockParams = {};
  mockReplace.mockReset();
  (api.sendSupportChatMessage as jest.Mock).mockReset();
  (api.sendSupportChatMessage as jest.Mock).mockResolvedValue({ thread: { id: THREAD }, message: { id: "m1" } });
  mockPick.mockReset();
  mockTake.mockReset();
  mockUpload.mockReset();
  mockUpload.mockImplementation((asset: { name: string }) => Promise.resolve(`file_${asset.name}`));
});

it("posts a report from a job as a new chat, then opens that chat", async () => {
  mockParams = { orderId: "ord_3ff0128e105a", title: "Tarpaulin 3x6 ft" };
  (api.sendSupportChatMessage as jest.Mock).mockResolvedValue({
    thread: { id: THREAD },
    message: { id: "m1" },
  });
  await render(<ReportProblemScreen />);

  expect(screen.getByText("Tarpaulin 3x6 ft")).toBeTruthy();
  expect(screen.getByText("3FF0-128E-105A")).toBeTruthy();
  expect(screen.getByText("GRIDGO Supplier 1.0.42")).toBeTruthy();
  expect(screen.getByText("Android 15, Google Pixel 7")).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText("What went wrong"), "The packing photo stops at 100%.");
  await fireEvent.press(screen.getByLabelText("Send to Operations"));

  expect(api.sendSupportChatMessage).toHaveBeenCalledWith(
    [
      "Problem report",
      "Job: Tarpaulin 3x6 ft",
      "Order 3FF0-128E-105A (ord_3ff0128e105a)",
      "",
      "The packing photo stops at 100%.",
      "",
      "App: GRIDGO Supplier 1.0.42",
      "Phone: Android 15, Google Pixel 7",
    ].join("\n"),
    undefined,
    { newThread: true },
  );
  expect(mockReplace).toHaveBeenCalledWith({ pathname: "/chat/[thread]", params: { thread: THREAD } });
});

it("sends nothing until the shop says what went wrong", async () => {
  await render(<ReportProblemScreen />);
  expect(screen.queryByText("Order")).toBeNull();

  await fireEvent.press(screen.getByLabelText("Send to Operations"));

  expect(screen.getByText("Say what went wrong before you send it.")).toBeTruthy();
  expect(api.sendSupportChatMessage).not.toHaveBeenCalled();
});

it("keeps the words on screen and names the failure when the report does not go", async () => {
  (api.sendSupportChatMessage as jest.Mock).mockRejectedValue(new TypeError("Network request failed"));
  await render(<ReportProblemScreen />);

  await fireEvent.changeText(screen.getByLabelText("What went wrong"), "Earnings will not load.");
  await fireEvent.press(screen.getByLabelText("Send to Operations"));

  expect(await screen.findByText(/send this report/)).toBeTruthy();
  expect(screen.getByDisplayValue("Earnings will not load.")).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Send to Operations")).toBeTruthy();
});

describe("screenshots", () => {
  async function writeReport() {
    await fireEvent.changeText(screen.getByLabelText("What went wrong"), "The packing photo stops at 100%.");
  }

  it("sends one screenshot with the report", async () => {
    mockPick.mockResolvedValue(shots("blank.png"));
    await render(<ReportProblemScreen />);
    await writeReport();

    await fireEvent.press(screen.getByLabelText("Add screenshot"));
    expect(await screen.findByLabelText("Screenshot 1")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Send to Operations"));

    await waitFor(() => expect(api.sendSupportChatMessage).toHaveBeenCalledTimes(1));
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload.mock.calls[0][0]).toEqual({ uri: "file:///cache/blank.png", name: "blank.png", mimeType: "image/png" });
    const [body, threadId, options] = (api.sendSupportChatMessage as jest.Mock).mock.calls[0];
    expect(body).toContain("Problem report");
    expect(threadId).toBeUndefined();
    expect(options).toEqual({ newThread: true, attachmentFileIds: ["file_blank.png"] });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/chat/[thread]", params: { thread: THREAD } });
  });

  it("takes a photo with the camera", async () => {
    mockTake.mockResolvedValue(shots("photo.jpg"));
    await render(<ReportProblemScreen />);

    await fireEvent.press(screen.getByLabelText("Take photo"));

    expect(await screen.findByLabelText("Screenshot 1")).toBeTruthy();
  });

  it("takes three screenshots, offers no fourth, and sends all three", async () => {
    mockPick.mockResolvedValue(shots("a.png", "b.png", "c.png"));
    await render(<ReportProblemScreen />);
    await writeReport();

    await fireEvent.press(screen.getByLabelText("Add screenshot"));
    expect(await screen.findByLabelText("Screenshot 3")).toBeTruthy();
    expect(screen.queryByLabelText("Add screenshot")).toBeNull();
    expect(screen.queryByLabelText("Take photo")).toBeNull();
    expect(screen.getByText("Up to 3. Only GRIDGO Operations see them.")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Send to Operations"));

    await waitFor(() => expect(api.sendSupportChatMessage).toHaveBeenCalledTimes(1));
    expect(mockUpload).toHaveBeenCalledTimes(3);
    expect((api.sendSupportChatMessage as jest.Mock).mock.calls[0][2]).toEqual({
      newThread: true,
      attachmentFileIds: ["file_a.png", "file_b.png", "file_c.png"],
    });
  });

  it("stops at three screenshots and says why", async () => {
    mockPick.mockResolvedValue(shots("a.png", "b.png", "c.png", "d.png"));
    await render(<ReportProblemScreen />);

    await fireEvent.press(screen.getByLabelText("Add screenshot"));

    expect(await screen.findByText("A report can include up to 3 screenshots.")).toBeTruthy();
    expect(screen.queryByLabelText("Screenshot 1")).toBeNull();
  });

  it("removes a screenshot before sending", async () => {
    mockPick.mockResolvedValue(shots("a.png", "b.png"));
    await render(<ReportProblemScreen />);

    await fireEvent.press(screen.getByLabelText("Add screenshot"));
    expect(await screen.findByLabelText("Screenshot 2")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Remove screenshot 1"));

    await waitFor(() => expect(screen.queryByLabelText("Screenshot 2")).toBeNull());
    expect(screen.getByLabelText("Screenshot 1").props.source).toEqual({ uri: "file:///cache/b.png" });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("keeps the report and its screenshot when an upload fails, sends nothing, and retries", async () => {
    mockPick.mockResolvedValue(shots("a.png", "b.png"));
    mockUpload.mockImplementation((asset: { name: string }) =>
      asset.name === "b.png" && mockUpload.mock.calls.length === 2
        ? Promise.reject(new Error("That photo did not reach GRIDGO. Try again."))
        : Promise.resolve(`file_${asset.name}`),
    );
    await render(<ReportProblemScreen />);
    await writeReport();

    await fireEvent.press(screen.getByLabelText("Add screenshot"));
    expect(await screen.findByLabelText("Screenshot 2")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Send to Operations"));

    expect(await screen.findByText(/did not upload, so nothing was sent/)).toBeTruthy();
    expect(api.sendSupportChatMessage).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("The packing photo stops at 100%.")).toBeTruthy();
    expect(screen.getByLabelText("Screenshot 2")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Send to Operations"));

    await waitFor(() => expect(api.sendSupportChatMessage).toHaveBeenCalledTimes(1));
    // The first screenshot went up the first time; only the failed one is sent again.
    expect(mockUpload.mock.calls.map(([asset]) => asset.name)).toEqual(["a.png", "b.png", "b.png"]);
    expect((api.sendSupportChatMessage as jest.Mock).mock.calls[0][2]).toEqual({
      newThread: true,
      attachmentFileIds: ["file_a.png", "file_b.png"],
    });
  });
});
