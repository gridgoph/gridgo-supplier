import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Keyboard, useWindowDimensions } from "react-native";
import { router } from "expo-router";

import ShopLocationStep from "@/app/(auth)/signup/location";
import { ShopLocationPicker } from "@/components/ShopLocationPicker";
import * as geocode from "@/lib/geocode";
import { PIN_OUTSIDE_PROBLEM, PIN_READING_PROBLEM, type ShopPin } from "@/lib/shopLocation";
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
  reverseAddress: jest.fn(async () => ({ ok: true, value: { address: "Davao City", inDavao: true } })),
  searchPlaces: jest.fn(async () => ({ ok: true, value: [] })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  // A queued answer a test never spent must not leak into the next one.
  jest.mocked(geocode.reverseAddress).mockReset();
  jest.mocked(geocode.reverseAddress).mockResolvedValue({ ok: true, value: { address: "Davao City", inDavao: true } });
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

/** The picker is controlled; this holds the pin the way a screen does. */
function Harness({
  onChange,
  onBlockerChange,
}: {
  onChange?: (pin: ShopPin) => void;
  onBlockerChange?: (problem: string | null) => void;
}) {
  const [pin, setPin] = useState<ShopPin | null>(null);
  return (
    <ShopLocationPicker
      pin={pin}
      onChange={(next) => {
        onChange?.(next);
        setPin(next);
      }}
      onBlockerChange={onBlockerChange}
    />
  );
}

describe("moving the pin", () => {
  const MAP = "Map of Davao City. Tap to place your shop, or drag the pin.";
  const moveTo = (lat: number, lng: number) =>
    fireEvent(screen.getByLabelText(MAP), "message", {
      nativeEvent: { data: JSON.stringify({ type: "pin", lat, lng }) },
    });

  /**
   * A slow answer for where the pin was must not land after the answer for
   * where it is now: applying it moved the shop's pin back.
   */
  it("keeps the newest pin when an older address lookup answers last", async () => {
    let answerFirst: (value: unknown) => void = () => undefined;
    jest
      .mocked(geocode.reverseAddress)
      .mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)) as never)
      .mockResolvedValueOnce({ ok: true, value: { address: "Second Street, Ecoland", inDavao: true } });
    const onChange = jest.fn();
    await render(<ShopLocationPicker pin={null} onChange={onChange} />);

    await moveTo(7.06, 125.6);
    await moveTo(7.07, 125.61);
    await act(async () => answerFirst({ ok: true, value: { address: "First Street", inDavao: true } }));

    expect(onChange).toHaveBeenLastCalledWith({ lat: 7.07, lng: 125.61, label: "Second Street, Ecoland" });
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ label: "First Street" }));
  });

  it("warns, and spends no lookup, on a pin outside Davao City", async () => {
    await render(<Harness />);
    await moveTo(7.5286, 125.7228);
    expect(geocode.reverseAddress).not.toHaveBeenCalled();
    expect(screen.getByText("Outside Davao City")).toBeTruthy();
  });

  it("asks for a drag onto the door after a barangay result", async () => {
    jest.mocked(geocode.searchPlaces).mockResolvedValueOnce({
      ok: true,
      value: [{ id: "1", lat: 7.05, lng: 125.55, label: "Talomo Proper", detail: "Davao City", address: "", precision: "area" }],
    });
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);
    const search = screen.getByLabelText("Search for your shop's address");
    await fireEvent.changeText(search, "Brgy. Talomo");
    await fireEvent(search, "submitEditing");
    await fireEvent.press(await screen.findByText("Talomo Proper"));

    expect(onChange).toHaveBeenLastCalledWith({ lat: 7.05, lng: 125.55, label: "" });
    expect(screen.getByText("This is the middle of Talomo Proper")).toBeTruthy();
    expect(screen.getByText("Drag the pin onto your shop's door.")).toBeTruthy();
  });

  /** C1: a search after a pin move must not orphan that move's address lookup. */
  it("still names a dropped pin when a search starts before its lookup answers", async () => {
    let answer: (value: unknown) => void = () => undefined;
    jest.mocked(geocode.reverseAddress).mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)) as never,
    );
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);
    await moveTo(7.06, 125.6);
    expect(screen.getByText("Reading this place…")).toBeTruthy();

    const search = screen.getByLabelText("Search for your shop's address");
    await fireEvent.changeText(search, "Recto");
    await fireEvent(search, "submitEditing");
    await act(async () => answer({ ok: true, value: { address: "Recto Street, Barangay 4-A", inDavao: true } }));

    expect(screen.queryByText("Reading this place…")).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({ lat: 7.06, lng: 125.6, label: "Recto Street, Barangay 4-A" });
    expect(screen.getByLabelText("Address at this pin").props.editable).toBe(true);
  });

  it("keeps a chosen result when an older pin's lookup answers afterwards", async () => {
    let answer: (value: unknown) => void = () => undefined;
    jest.mocked(geocode.reverseAddress).mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)) as never,
    );
    jest.mocked(geocode.searchPlaces).mockResolvedValueOnce({
      ok: true,
      value: [{ id: "1", lat: 7.07, lng: 125.61, label: "Recto Street", detail: "Barangay 4-A", address: "Recto Street, Barangay 4-A", precision: "exact" }],
    });
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);
    await moveTo(7.06, 125.6);
    const search = screen.getByLabelText("Search for your shop's address");
    await fireEvent.changeText(search, "Recto");
    await fireEvent(search, "submitEditing");
    await fireEvent.press(await screen.findByText("Recto Street"));
    await act(async () => answer({ ok: true, value: { address: "Old Street", inDavao: true } }));

    expect(onChange).toHaveBeenLastCalledWith({ lat: 7.07, lng: 125.61, label: "Recto Street, Barangay 4-A" });
    expect(screen.queryByText("Reading this place…")).toBeNull();
  });

  /**
   * C2: the box is coarse at its edges. A point inside it, off Samal, that the
   * address lookup files under another town is refused on that answer.
   */
  it("blocks a pin the address lookup puts in another town, inside the box", async () => {
    jest.mocked(geocode.reverseAddress).mockResolvedValueOnce({
      ok: true,
      value: { address: "National Highway", inDavao: false },
    });
    const onBlockerChange = jest.fn();
    await render(<Harness onBlockerChange={onBlockerChange} />);
    await moveTo(7.55, 125.68);
    expect(geocode.reverseAddress).toHaveBeenCalled();
    expect(screen.getByText("Outside Davao City")).toBeTruthy();
    expect(onBlockerChange).toHaveBeenLastCalledWith(PIN_OUTSIDE_PROBLEM);
  });

  it("blocks the pin while a move is still being read, and frees it once named", async () => {
    let answer: (value: unknown) => void = () => undefined;
    jest.mocked(geocode.reverseAddress).mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)) as never,
    );
    const onBlockerChange = jest.fn();
    await render(<Harness onBlockerChange={onBlockerChange} />);
    await moveTo(7.06, 125.6);
    expect(onBlockerChange).toHaveBeenLastCalledWith(PIN_READING_PROBLEM);
    await act(async () => answer({ ok: true, value: { address: "Recto Street", inDavao: true } }));
    expect(onBlockerChange).toHaveBeenLastCalledWith(null);
  });
});

/** C4: a lookup that failed can be sent again without changing the words. */
it("searches the same words again from Search again, and from the keyboard", async () => {
  jest
    .mocked(geocode.searchPlaces)
    .mockResolvedValueOnce({ ok: false, reason: "offline" })
    .mockResolvedValueOnce({ ok: false, reason: "offline" })
    .mockResolvedValueOnce({ ok: true, value: [] });
  await render(<ShopLocationPicker pin={null} onChange={jest.fn()} />);
  const search = screen.getByLabelText("Search for your shop's address");
  await fireEvent.changeText(search, "SM Lanang");
  await fireEvent(search, "submitEditing");
  await fireEvent.press(await screen.findByText("Search again"));
  await fireEvent(search, "submitEditing");

  expect(geocode.searchPlaces).toHaveBeenCalledTimes(3);
  for (const call of jest.mocked(geocode.searchPlaces).mock.calls) expect(call[0]).toBe("SM Lanang");
  expect(await screen.findByText("No place in Davao City matched that")).toBeTruthy();
  expect(screen.queryByText("Search again")).toBeNull();
});

/** C2 on the screen: Use this pin does not move on from a pin outside the city. */
it("will not continue from a pin outside Davao City", async () => {
  jest.mocked(geocode.reverseAddress).mockResolvedValueOnce({
    ok: true,
    value: { address: "Babak Road", inDavao: false },
  });
  await render(<ShopLocationStep />);
  await fireEvent(screen.getByLabelText("Map of Davao City. Tap to place your shop, or drag the pin."), "message", {
    nativeEvent: { data: JSON.stringify({ type: "pin", lat: 7.08, lng: 125.68 }) },
  });
  await fireEvent.press(screen.getByText("Use this pin"));
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.getByText(PIN_OUTSIDE_PROBLEM)).toBeTruthy();
});

/** Codex review of #256, S1, on Apply: Samal + failed lookup + a typed address. */
it("will not continue from Samal when the address lookup fails", async () => {
  jest.mocked(geocode.reverseAddress).mockResolvedValueOnce({ ok: false, reason: "offline" });
  await render(<ShopLocationStep />);
  await fireEvent(screen.getByLabelText("Map of Davao City. Tap to place your shop, or drag the pin."), "message", {
    nativeEvent: { data: JSON.stringify({ type: "pin", lat: 7.082, lng: 125.682 }) },
  });
  await fireEvent.changeText(screen.getByLabelText("Address at this pin"), "Babak Road, near the port");
  await fireEvent.press(screen.getByText("Use this pin"));
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.getByText(PIN_OUTSIDE_PROBLEM)).toBeTruthy();
});

/** A draft restored with a pin on Samal is refused before anything is asked. */
it("will not continue from a restored draft pin on Samal", async () => {
  useSignupDraft.setState({
    draft: { ...EMPTY_SIGNUP_DRAFT, pin: { lat: 7.082, lng: 125.682, label: "Babak Road" } },
  });
  await render(<ShopLocationStep />);
  expect(screen.getByText("Outside Davao City")).toBeTruthy();
  await fireEvent.press(screen.getByText("Use this pin"));
  expect(router.push).not.toHaveBeenCalled();
});
