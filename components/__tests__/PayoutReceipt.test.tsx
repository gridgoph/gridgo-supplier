import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { PayoutReceipt } from "@/components/PayoutReceipt";
import * as api from "@/lib/api";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({ type: "dismiss" })) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual<typeof api>("@/lib/api"),
  getDownloadUrl: jest.fn(),
}));

const getDownloadUrl = api.getDownloadUrl as jest.MockedFunction<typeof api.getDownloadUrl>;
const { openBrowserAsync } = jest.requireMock("expo-web-browser") as { openBrowserAsync: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  let calls = 0;
  getDownloadUrl.mockImplementation(async () => {
    calls += 1;
    return { fileId: "file_receipt", url: `https://files.test/receipt-${calls}`, expiresAt: "", expiresInSeconds: 300 };
  });
});

/**
 * The receipt is the shop's proof the money left GRIDGO, so it names the
 * reference beside the picture and opens through a link asked for at the
 * moment of the tap, never one from when the screen was drawn.
 */
it("names the reference and opens the receipt through a fresh link", async () => {
  const view = await render(
    <PayoutReceipt fileId="file_receipt" reference="GCASH-777" label="Printing on Staff polos" />,
  );
  expect(await screen.findByText("Reference GCASH-777")).toBeTruthy();
  await waitFor(() => expect(getDownloadUrl).toHaveBeenCalledTimes(1));

  await fireEvent.press(screen.getByLabelText("Open the wallet receipt for Printing on Staff polos"));
  await waitFor(() => expect(openBrowserAsync).toHaveBeenCalledWith("https://files.test/receipt-2"));
  await view.unmount();
});

it("says when no reference was recorded", async () => {
  const view = await render(<PayoutReceipt fileId="file_receipt" label="Printing" />);
  expect(await screen.findByText("No reference recorded")).toBeTruthy();
  await view.unmount();
});
