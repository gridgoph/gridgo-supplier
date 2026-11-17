import { fireEvent, render, screen } from "@testing-library/react-native";
import { useWindowDimensions } from "react-native";

import ShopLocationScreen from "@/app/shop-location";
import * as geocode from "@/lib/geocode";
import { PIN_OUTSIDE_PROBLEM } from "@/lib/shopLocation";
import { saveShopLocation } from "@/lib/verification";
import { askConfirm } from "@/store/sheets";

jest.mock("react-native-keyboard-controller", () => jest.requireActual("react-native-keyboard-controller/jest"));
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("react-native-webview", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return {
    WebView: React.forwardRef(function TestWebView(props: object, ref: React.Ref<unknown>) {
      React.useImperativeHandle(ref, () => ({ injectJavaScript: jest.fn() }));
      return <View {...props} />;
    }),
  };
});
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("@/lib/api", () => ({ getSupplierProfile: jest.fn(() => new Promise(() => undefined)) }));
jest.mock("@/lib/verification", () => ({
  PIN_NOT_OPEN_YET: "not open",
  saveShopLocation: jest.fn(async () => ({ status: "saved" })),
}));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => true) }));
jest.mock("@/store/session", () => {
  const state = {
    user: { shop: { lat: 7.0731, lng: 125.6128, label: "San Pedro Street, Barangay 3-A" } },
    refresh: jest.fn(async () => undefined),
  };
  return { useSession: (select: (s: typeof state) => unknown) => select(state) };
});
jest.mock("@/lib/geocode", () => ({
  ...jest.requireActual("@/lib/geocode"),
  reverseAddress: jest.fn(),
}));

const MAP = "Map of Davao City. Tap to place your shop, or drag the pin.";

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useWindowDimensions).mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
});

async function dropPinWithFailedLookup(lat: number, lng: number) {
  jest.mocked(geocode.reverseAddress).mockResolvedValueOnce({ ok: false, reason: "offline" });
  await fireEvent(screen.getByLabelText(MAP), "message", {
    nativeEvent: { data: JSON.stringify({ type: "pin", lat, lng }) },
  });
  await fireEvent.changeText(screen.getByLabelText("Address at this pin"), "Babak Road, near the port");
}

/**
 * Codex review of #256, S1: with the address lookup offline, a pin on Samal
 * (inside the search box) plus a typed address reached the confirmation and
 * the PATCH. The outline answers without a network.
 */
it("will not move the shop to Samal when the address lookup fails", async () => {
  await render(<ShopLocationScreen />);
  await dropPinWithFailedLookup(7.083, 125.683);

  expect(screen.getAllByText(PIN_OUTSIDE_PROBLEM).length).toBeGreaterThan(0);
  expect(screen.getByText("Outside Davao City")).toBeTruthy();
  await fireEvent.press(screen.getByText("Save this pin"));
  expect(askConfirm).not.toHaveBeenCalled();
  expect(saveShopLocation).not.toHaveBeenCalled();
});

it("still saves a typed address on the mainland when the lookup fails", async () => {
  await render(<ShopLocationScreen />);
  // Sasa wharf tip: the shore nearest Samal, and Davao City.
  await dropPinWithFailedLookup(7.125, 125.664);

  expect(screen.queryByText(PIN_OUTSIDE_PROBLEM)).toBeNull();
  await fireEvent.press(screen.getByText("Save this pin"));
  expect(askConfirm).toHaveBeenCalled();
  expect(saveShopLocation).toHaveBeenCalledWith({ lat: 7.125, lng: 125.664, label: "Babak Road, near the port" });
});
