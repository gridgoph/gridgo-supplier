import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Linking } from "react-native";

import { ShopLocationPicker } from "@/components/ShopLocationPicker";
import * as deviceLocation from "@/lib/deviceLocation";
import * as geocode from "@/lib/geocode";
import { PIN_LOCATING_PROBLEM, PIN_OUTSIDE_PROBLEM, type ShopPin } from "@/lib/shopLocation";

const mockInject = jest.fn();
jest.mock("react-native-webview", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return {
    WebView: React.forwardRef(function TestWebView(props: object, ref: React.Ref<unknown>) {
      React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
      return <View {...props} />;
    }),
  };
});
jest.mock("@/lib/geocode", () => ({
  ...jest.requireActual("@/lib/geocode"),
  reverseAddress: jest.fn(async () => ({ ok: true, value: { address: "Recto Street, Barangay 4-A", inDavao: true } })),
  searchPlaces: jest.fn(async () => ({ ok: true, value: [] })),
}));
jest.mock("@/lib/deviceLocation", () => ({
  ...jest.requireActual("@/lib/deviceLocation"),
  requestCurrentLocation: jest.fn(),
  canUseDeviceLocation: jest.fn(() => true),
}));

const MAP = "Map of Davao City. Tap to place your shop, or drag the pin.";
const DOWNTOWN = { lat: 7.0731, lng: 125.6128 };

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

/** The last model pushed into the map document. */
function lastModel(): Record<string, unknown> {
  const script = String(mockInject.mock.calls.at(-1)?.[0] ?? "");
  const json = script.slice(script.indexOf("applyModel(") + "applyModel(".length, script.lastIndexOf("); }"));
  return JSON.parse(json) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(geocode.reverseAddress).mockResolvedValue({
    ok: true,
    value: { address: "Recto Street, Barangay 4-A", inDavao: true },
  });
});

it("puts the pin where the phone is, with its circle, and names the address", async () => {
  jest.mocked(deviceLocation.requestCurrentLocation).mockResolvedValueOnce({
    status: "ok",
    point: DOWNTOWN,
    accuracyMeters: 85,
  });
  const onChange = jest.fn();
  await render(<Harness onChange={onChange} />);
  await fireEvent.press(screen.getByLabelText("Use my location"));

  expect(onChange).toHaveBeenCalledWith({ ...DOWNTOWN, label: "" });
  expect(onChange).toHaveBeenLastCalledWith({ ...DOWNTOWN, label: "Recto Street, Barangay 4-A" });
  expect(lastModel()).toMatchObject({ pin: DOWNTOWN, accuracyMeters: 85 });
  expect(screen.getByText("Your phone placed this within about 85 m")).toBeTruthy();
  expect(screen.getByText("Drag the pin onto your shop's door.")).toBeTruthy();
});

it("forgets the circle once the shop drags the pin", async () => {
  jest.mocked(deviceLocation.requestCurrentLocation).mockResolvedValueOnce({
    status: "ok",
    point: DOWNTOWN,
    accuracyMeters: 85,
  });
  await render(<Harness />);
  await fireEvent.press(screen.getByLabelText("Use my location"));
  await fireEvent(screen.getByLabelText(MAP), "message", {
    nativeEvent: { data: JSON.stringify({ type: "pin", lat: 7.074, lng: 125.613 }) },
  });
  expect(lastModel()).toMatchObject({ pin: { lat: 7.074, lng: 125.613 }, accuracyMeters: null });
  expect(screen.queryByText(/Your phone placed this/)).toBeNull();
});

it("says Finding you and holds the save while the phone looks", async () => {
  let answer: (value: deviceLocation.DeviceLocationResult) => void = () => undefined;
  jest
    .mocked(deviceLocation.requestCurrentLocation)
    .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
  const onBlockerChange = jest.fn();
  await render(<Harness onBlockerChange={onBlockerChange} />);
  await fireEvent.press(screen.getByLabelText("Use my location"));

  expect(screen.getAllByText("Finding you…").length).toBeGreaterThan(0);
  expect(screen.getByLabelText("Use my location").props.accessibilityState).toMatchObject({ busy: true });
  expect(onBlockerChange).toHaveBeenLastCalledWith(PIN_LOCATING_PROBLEM);

  await act(async () => answer({ status: "ok", point: DOWNTOWN, accuracyMeters: 9 }));
  expect(screen.getByText("Placed where your phone is")).toBeTruthy();
  expect(onBlockerChange).toHaveBeenLastCalledWith(null);
});

it("lets a pin the shop places while the phone is looking win over the late fix", async () => {
  let answer: (value: deviceLocation.DeviceLocationResult) => void = () => undefined;
  jest
    .mocked(deviceLocation.requestCurrentLocation)
    .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
  const onChange = jest.fn();
  await render(<Harness onChange={onChange} />);
  await fireEvent.press(screen.getByLabelText("Use my location"));
  await fireEvent(screen.getByLabelText(MAP), "message", {
    nativeEvent: { data: JSON.stringify({ type: "pin", lat: 7.06, lng: 125.6 }) },
  });
  await act(async () => answer({ status: "ok", point: DOWNTOWN, accuracyMeters: 40 }));

  expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining(DOWNTOWN));
  expect(onChange).toHaveBeenLastCalledWith({ lat: 7.06, lng: 125.6, label: "Recto Street, Barangay 4-A" });
  expect(screen.queryByText("Finding you…")).toBeNull();
});

it("will not drop the pin where a phone outside Davao City is", async () => {
  jest.mocked(deviceLocation.requestCurrentLocation).mockResolvedValueOnce({
    status: "ok",
    point: { lat: 7.0833, lng: 125.7167 }, // Samal
    accuracyMeters: 10,
  });
  const onChange = jest.fn();
  const onBlockerChange = jest.fn();
  await render(<Harness onChange={onChange} onBlockerChange={onBlockerChange} />);
  await fireEvent.press(screen.getByLabelText("Use my location"));

  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText(deviceLocation.LOCATION_OUTSIDE_DAVAO)).toBeTruthy();
  expect(onBlockerChange).not.toHaveBeenCalledWith(PIN_OUTSIDE_PROBLEM);
});

it("blocks a fix the address lookup files under another town", async () => {
  jest.mocked(deviceLocation.requestCurrentLocation).mockResolvedValueOnce({
    status: "ok",
    point: { lat: 7.3, lng: 125.6 },
    accuracyMeters: 10,
  });
  jest.mocked(geocode.reverseAddress).mockResolvedValueOnce({ ok: true, value: { address: "Highway", inDavao: false } });
  const onBlockerChange = jest.fn();
  await render(<Harness onBlockerChange={onBlockerChange} />);
  await fireEvent.press(screen.getByLabelText("Use my location"));
  expect(screen.getByText("Outside Davao City")).toBeTruthy();
  expect(onBlockerChange).toHaveBeenLastCalledWith(PIN_OUTSIDE_PROBLEM);
});

it("offers Try again after a refusal, and asks again from it", async () => {
  jest
    .mocked(deviceLocation.requestCurrentLocation)
    .mockResolvedValueOnce({ status: "denied", message: deviceLocation.LOCATION_DENIED, remedy: "retry" })
    .mockResolvedValueOnce({ status: "ok", point: DOWNTOWN, accuracyMeters: 9 });
  await render(<Harness />);
  await fireEvent.press(screen.getByLabelText("Use my location"));
  expect(screen.getByText(deviceLocation.LOCATION_DENIED)).toBeTruthy();

  await fireEvent.press(screen.getByLabelText("Try again"));
  expect(deviceLocation.requestCurrentLocation).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(deviceLocation.LOCATION_DENIED)).toBeNull();
});

it("sends a permanent refusal to the phone's settings", async () => {
  const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  jest
    .mocked(deviceLocation.requestCurrentLocation)
    .mockResolvedValueOnce({ status: "blocked", message: deviceLocation.LOCATION_BLOCKED, remedy: "settings" });
  await render(<Harness />);
  await fireEvent.press(screen.getByLabelText("Use my location"));
  expect(screen.getByText(deviceLocation.LOCATION_BLOCKED)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Open settings"));
  expect(open).toHaveBeenCalled();
});

it("says when location is switched off, and offers to try again", async () => {
  jest
    .mocked(deviceLocation.requestCurrentLocation)
    .mockResolvedValueOnce({ status: "services_off", message: deviceLocation.LOCATION_SERVICES_OFF, remedy: "retry" });
  await render(<Harness />);
  await fireEvent.press(screen.getByLabelText("Use my location"));
  expect(screen.getByText(deviceLocation.LOCATION_SERVICES_OFF)).toBeTruthy();
  expect(screen.getByLabelText("Try again")).toBeTruthy();
});

it("is not drawn where the runtime cannot locate at all", async () => {
  jest.mocked(deviceLocation.canUseDeviceLocation).mockReturnValueOnce(false);
  await render(<Harness />);
  expect(screen.queryByLabelText("Use my location")).toBeNull();
});
