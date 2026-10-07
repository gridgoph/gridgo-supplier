import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Keyboard, useWindowDimensions } from "react-native";
import { router } from "expo-router";

import ShopLocationStep from "@/app/(auth)/signup/location";
import { ShopLocationPicker } from "@/components/ShopLocationPicker";
import { useSignupDraft, EMPTY_SIGNUP_DRAFT } from "@/store/signupDraft";

const mockScrollTo = jest.fn();
jest.mock("react-native-keyboard-controller", () => {
  // Native scrolling is the boundary; keep the step and picker real.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ScrollView } = require("react-native");
  return {
    ...jest.requireActual("react-native-keyboard-controller/jest"),
    KeyboardAwareScrollView: React.forwardRef(function TestScroll(props: object, ref: React.Ref<unknown>) {
      React.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }));
      return <ScrollView {...props} />;
    }),
  };
});

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

afterEach(() => jest.restoreAllMocks());

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

it("scrolls the signup map to the top when search is focused, using its latest layout", async () => {
  jest.mocked(useWindowDimensions).mockReturnValue({ width: 332, height: 435, scale: 3.25, fontScale: 1.3 });
  await render(<ShopLocationStep />);
  const picker = screen.getByTestId("signup-location-picker");
  const search = screen.getByLabelText("Search for your shop's address");

  await fireEvent(picker, "layout", { nativeEvent: { layout: { x: 0, y: 216, width: 332, height: 480 } } });
  expect(mockScrollTo).not.toHaveBeenCalled();
  await fireEvent(search, "focus");
  expect(mockScrollTo).toHaveBeenLastCalledWith({ y: 216, animated: false });

  await fireEvent(search, "blur");
  await fireEvent(picker, "layout", { nativeEvent: { layout: { x: 0, y: 264, width: 332, height: 480 } } });
  await fireEvent(search, "focus");
  expect(mockScrollTo).toHaveBeenLastCalledWith({ y: 264, animated: false });
});

it("repositions after the keyboard opens, but leaves address editing alone", async () => {
  const listen = jest.spyOn(Keyboard, "addListener");
  await render(<ShopLocationStep />);
  await fireEvent(screen.getByTestId("signup-location-picker"), "layout", {
    nativeEvent: { layout: { x: 0, y: 216, width: 332, height: 480 } },
  });
  const search = screen.getByLabelText("Search for your shop's address");
  expect(listen).not.toHaveBeenCalled();
  await fireEvent(search, "focus");
  const keyboardShown = listen.mock.calls.find(([event]) => event === "keyboardDidShow")?.[1];
  expect(keyboardShown).toBeDefined();
  const remove = jest.spyOn(listen.mock.results[0].value, "remove");
  mockScrollTo.mockClear();
  await act(() => keyboardShown?.({
    duration: 250,
    easing: "keyboard",
    endCoordinates: { screenX: 0, screenY: 435, width: 332, height: 300 },
  }));
  expect(mockScrollTo).toHaveBeenCalledWith({ y: 216, animated: false });
  await fireEvent(search, "blur");
  expect(remove).toHaveBeenCalledTimes(1);
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
