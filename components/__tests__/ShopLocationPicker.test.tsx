import { fireEvent, render, screen } from "@testing-library/react-native";
import { useWindowDimensions } from "react-native";
import { router } from "expo-router";

import ShopLocationStep from "@/app/(auth)/signup/location";
import { ShopLocationPicker } from "@/components/ShopLocationPicker";
import { useSignupDraft, EMPTY_SIGNUP_DRAFT } from "@/store/signupDraft";

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("react-native-webview", () => {
  // Native WebView needs an imperative handle under the test renderer.
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
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/lib/geocode", () => ({
  ...jest.requireActual("@/lib/geocode"),
  reverseLabel: jest.fn(async () => ({ ok: true, value: "Davao City" })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useWindowDimensions).mockReturnValue({ width: 412, height: 915, scale: 3.5, fontScale: 1 });
  useSignupDraft.setState({ draft: { ...EMPTY_SIGNUP_DRAFT }, hydrated: true });
});

it.each([
  [412, 915, 1],
  [360, 800, 1],
  [390, 844, 1],
  [412, 565, 1],
  [360, 450, 2],
])("keeps a usable map at %sx%s and font scale %s", async (width, height, fontScale) => {
  jest.mocked(useWindowDimensions).mockReturnValue({ width, height, scale: 3.5, fontScale });
  await render(<ShopLocationPicker pin={null} onChange={jest.fn()} />);
  const map = screen.getByTestId("shop-location-map");
  expect(map.props.style.height).toBeGreaterThanOrEqual(280);
  expect(map.props.style.height).toBeLessThanOrEqual(480);
});

it("lets the map step scroll without scrolling away its action", async () => {
  await render(<ShopLocationStep />);
  let ancestor = screen.getByTestId("shop-location-map").parent;
  while (ancestor && ancestor.props.keyboardShouldPersistTaps !== "handled") {
    ancestor = ancestor.parent;
  }
  expect(ancestor).not.toBeNull();
  let buttonAncestor = screen.getByText("Use this pin").parent;
  while (buttonAncestor) {
    expect(buttonAncestor).not.toBe(ancestor);
    buttonAncestor = buttonAncestor.parent;
  }
});

it("keeps the selected coordinates and corrected address when Use this pin continues", async () => {
  const pin = { lat: 7.0731, lng: 125.6128, label: "Davao City" };
  useSignupDraft.setState({ draft: { ...EMPTY_SIGNUP_DRAFT, pin } });
  await render(<ShopLocationStep />);
  await fireEvent.changeText(screen.getByLabelText("Address at this pin"), "Door beside the corner");
  await fireEvent.press(screen.getByText("Use this pin"));
  expect(useSignupDraft.getState().draft.pin).toEqual({ ...pin, label: "Door beside the corner" });
  expect(router.push).toHaveBeenCalledWith("/(auth)/signup/services");
});
