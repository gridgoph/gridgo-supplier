import { fireEvent, render, screen } from "@testing-library/react-native";
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
jest.mock("@/lib/problemReport", () => ({
  ...jest.requireActual("@/lib/problemReport"),
  readProblemReportDevice: () => ({ appVersion: "1.0.42", device: "Android 15, Google Pixel 7" }),
}));

const THREAD = "5b8c1d2e-3f40-4a51-8b62-7c83d94e05f6";

beforeEach(() => {
  mockParams = {};
  mockReplace.mockReset();
  (api.sendSupportChatMessage as jest.Mock).mockReset();
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
