import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock("@/lib/productTemplatesApi", () => ({
  askForTemplate: jest.fn(),
  askForSetup: jest.fn(),
  loadSetupRequests: jest.fn(),
}));

import AskTemplateScreen from "@/app/shop/ask-template";
import SetupHelpScreen from "@/app/shop/setup-help";
import { askForSetup, askForTemplate, loadSetupRequests } from "@/lib/productTemplatesApi";
import { router } from "expo-router";

beforeEach(() => {
  jest.clearAllMocks();
  (loadSetupRequests as jest.Mock).mockResolvedValue({
    status: "ok",
    value: [
      { id: "psr_1", kind: "template", requestedName: "Acrylic keychains", message: "5 cm", fileCount: 0, status: "pending", reason: null, createdAt: null },
      { id: "psr_2", kind: "setup", requestedName: null, message: "Tarpaulin ₱18 per sq ft", fileCount: 1, status: "pending", reason: null, createdAt: null },
    ],
  });
});

describe("not in the list: ask GRIDGO to add it", () => {
  it("names what is missing before sending, then sends the request", async () => {
    (askForTemplate as jest.Mock).mockResolvedValue({ status: "ok", value: { id: "psr_3" } });
    const view = await render(<AskTemplateScreen />);
    expect(await screen.findByText("Acrylic keychains")).toBeTruthy();
    expect(screen.queryByText("Tarpaulin ₱18 per sq ft")).toBeNull();

    await fireEvent.press(screen.getByLabelText("Send request"));
    expect(screen.getByText("Name the product, the way a client would ask for it.")).toBeTruthy();
    expect(askForTemplate).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText("Product"), "Ref magnets");
    await fireEvent.changeText(screen.getByLabelText("About it"), "Rubber magnet, 2 x 3 in");
    await fireEvent.press(screen.getByLabelText("Send request"));
    await waitFor(() => expect(askForTemplate).toHaveBeenCalledWith({ name: "Ref magnets", message: "Rubber magnet, 2 x 3 in" }));
    expect(await screen.findByTestId("request-sent")).toBeTruthy();
    await view.unmount();
  });

  it("keeps today's builder one tap away", async () => {
    const view = await render(<AskTemplateScreen />);
    await fireEvent.press(screen.getByText("Make a custom product instead"));
    expect(router.push).toHaveBeenCalledWith("/shop/new");
    await view.unmount();
  });
});

describe("let GRIDGO set it up", () => {
  it("needs a price list or a message, then sends it to the GRIDGO team", async () => {
    (askForSetup as jest.Mock).mockResolvedValue({ status: "ok", value: { id: "psr_4" } });
    const view = await render(<SetupHelpScreen />);
    expect(await screen.findByText("Tarpaulin ₱18 per sq ft")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Send to GRIDGO"));
    expect(screen.getByText("Add a photo of your price list, a voice note, or a message.")).toBeTruthy();
    expect(askForSetup).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText("Message for the GRIDGO team"), "Flyers ₱5 each, A4");
    await fireEvent.press(screen.getByLabelText("Send to GRIDGO"));
    await waitFor(() => expect(askForSetup).toHaveBeenCalledWith({ message: "Flyers ₱5 each, A4", fileIds: [] }));
    expect(await screen.findByTestId("setup-sent")).toBeTruthy();
    expect(screen.getByText(/They stay hidden until you confirm the prices/)).toBeTruthy();
    await view.unmount();
  });
});
