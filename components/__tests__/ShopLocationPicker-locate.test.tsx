import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Linking } from "react-native";

import { ShopLocationPicker } from "@/components/ShopLocationPicker";
import * as deviceLocation from "@/lib/deviceLocation";
import * as geocode from "@/lib/geocode";
import { PIN_LOCATING_PROBLEM, PIN_OUTSIDE_PROBLEM, PIN_READING_PROBLEM, type ShopPin } from "@/lib/shopLocation";

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

/** Review F1: the fix must lose the moment the pin is picked up, not at the drop. */
it("drops a fix still on its way as soon as the shop picks the pin up", async () => {
  let answer: (value: deviceLocation.DeviceLocationResult) => void = () => undefined;
  jest
    .mocked(deviceLocation.requestCurrentLocation)
    .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
  const onChange = jest.fn();
  const saved: ShopPin = { ...DOWNTOWN, label: "Recto Street" };
  function Saved() {
    const [pin, setPin] = useState<ShopPin | null>(saved);
    return (
      <ShopLocationPicker
        pin={pin}
        onChange={(next) => {
          onChange(next);
          setPin(next);
        }}
      />
    );
  }
  await render(<Saved />);
  await fireEvent.press(screen.getByLabelText("Use my location"));
  await fireEvent(screen.getByLabelText(MAP), "message", { nativeEvent: { data: JSON.stringify({ type: "grab" }) } });
  // Finding you… ends at once: the hand owns the pin now.
  expect(screen.queryByText("Finding you…")).toBeNull();
  await act(async () => answer({ status: "ok", point: { lat: 7.09, lng: 125.62 }, accuracyMeters: 8 }));

  expect(onChange).not.toHaveBeenCalled();
  expect(lastModel()).toMatchObject({ pin: DOWNTOWN, accuracyMeters: null });
});

/** Review F3: a failure that arrives on its own is announced, not only drawn. */
it("announces a location failure to screen readers", async () => {
  jest
    .mocked(deviceLocation.requestCurrentLocation)
    .mockResolvedValueOnce({ status: "unavailable", message: deviceLocation.LOCATION_UNAVAILABLE, remedy: "retry" });
  await render(<Harness />);
  await fireEvent.press(screen.getByLabelText("Use my location"));
  // The notice is not one grouped element (its Try again must stay reachable),
  // so the alert is the container the message sits in.
  let node = screen.getByText(deviceLocation.LOCATION_UNAVAILABLE).parent;
  while (node && node.props.accessibilityRole !== "alert") node = node.parent;
  expect(node?.props.accessibilityLiveRegion).toBe("assertive");
  expect(node?.props["aria-live"]).toBe("assertive");
  expect(screen.getByLabelText("Try again")).toBeTruthy();
});

describe("moving the pin without dragging it", () => {
  const saved: ShopPin = { ...DOWNTOWN, label: "Recto Street" };
  function Saved({ onChange, onBlockerChange }: { onChange?: (pin: ShopPin) => void; onBlockerChange?: (p: string | null) => void }) {
    const [pin, setPin] = useState<ShopPin | null>(saved);
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

  afterEach(() => jest.useRealTimers());

  /** Review F5: a keyboard or screen reader can make the last few metres. */
  it("nudges the pin a few metres per press and reads the address once it rests", async () => {
    jest.useFakeTimers();
    const onChange = jest.fn();
    const onBlockerChange = jest.fn();
    await render(<Saved onChange={onChange} onBlockerChange={onBlockerChange} />);
    await fireEvent.press(screen.getByLabelText("Move the pin up"));
    await fireEvent.press(screen.getByLabelText("Move the pin right"));

    const moved = onChange.mock.calls.at(-1)?.[0] as ShopPin;
    expect(moved.lat).toBeGreaterThan(DOWNTOWN.lat);
    expect(moved.lng).toBeGreaterThan(DOWNTOWN.lng);
    expect(moved.lat - DOWNTOWN.lat).toBeLessThan(0.0001);
    expect(geocode.reverseAddress).not.toHaveBeenCalled();
    expect(onBlockerChange).toHaveBeenLastCalledWith(PIN_READING_PROBLEM);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(geocode.reverseAddress).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ lat: moved.lat, lng: moved.lng, label: "Recto Street, Barangay 4-A" });
  });

  it("is reachable by name for each direction, at a 44 pt target", async () => {
    await render(<Saved />);
    for (const label of ["Move the pin up", "Move the pin down", "Move the pin left", "Move the pin right"]) {
      const button = screen.getByLabelText(label);
      expect(button.props.accessibilityRole).toBe("button");
      expect(button.props.className).toContain("h-11 w-11");
    }
  });

  it("drops a phone fix still on its way", async () => {
    let answer: (value: deviceLocation.DeviceLocationResult) => void = () => undefined;
    jest
      .mocked(deviceLocation.requestCurrentLocation)
      .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const onChange = jest.fn();
    await render(<Saved onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText("Use my location"));
    await fireEvent.press(screen.getByLabelText("Move the pin down"));
    await act(async () => answer({ status: "ok", point: { lat: 7.09, lng: 125.62 }, accuracyMeters: 8 }));
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ lat: 7.09 }));
  });
});
