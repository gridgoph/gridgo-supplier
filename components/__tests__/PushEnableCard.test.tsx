import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";

import { PushEnableCard } from "@/components/PushEnableCard";
import { usePush } from "@/store/push";
import { useSession } from "@/store/session";

/**
 * The one surface that may raise the permission dialog.
 *
 * What matters is that it never raises it by itself, that it says what will
 * arrive before it does, and that a refusal leaves it showing something true
 * rather than a button that can no longer do anything.
 */

const mocked = Notifications as jest.Mocked<typeof Notifications>;

const signIn = () =>
  useSession.setState({
    user: {
      id: "u1",
      email: "shop@example.ph",
      name: "Shop Owner",
      role: "supplier",
      supplierName: "Demo Print Shop",
    },
  });

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ user: null });
  usePush.setState({
    supported: true,
    permission: "undetermined",
    token: null,
    busy: false,
    error: null,
  });
});

it("offers the ask, and says in one line what will arrive", async () => {
  signIn();
  await render(<PushEnableCard />);

  expect(screen.getByText("Get these on your phone")).toBeTruthy();
  expect(screen.getByText(/offers your shop work/i)).toBeTruthy();
  expect(screen.getByText("Turn on alerts")).toBeTruthy();
});

it("draws nothing at all once permission is granted", async () => {
  signIn();
  usePush.setState({ permission: "granted" });
  await render(<PushEnableCard />);

  expect(screen.queryByText("Get these on your phone")).toBeNull();
});

it("asks at the door, promising only what an unclaimed phone actually gets", async () => {
  // A shop that installs and never signs in is still a phone GRIDGO has to
  // reach with "there is a new version". The door is the only surface that
  // shop will ever see, so the ask lives here — and it must not promise job
  // offers GRIDGO cannot address until somebody signs in.
  await render(<PushEnableCard />);
  expect(screen.getByText("Get GRIDGO news on this phone")).toBeTruthy();
  expect(screen.getByText(/new version/i)).toBeTruthy();
  expect(screen.queryByText(/offers your shop work/i)).toBeNull();
});

it("points a refused phone at its own settings instead of a dialog it cannot raise", async () => {
  signIn();
  usePush.setState({ permission: "blocked" });
  await render(<PushEnableCard />);

  expect(screen.getByText("Alerts are off for GRIDGO")).toBeTruthy();
  expect(screen.getByText("Open phone settings")).toBeTruthy();
  // And it still says the Alerts tab keeps working, so a refusal never reads
  // as the app being broken.
  expect(screen.getByText(/while the app is open/i)).toBeTruthy();
});

// Last in the file on purpose: this press drives an async update into a store
// outside React, and every later `render` in the same file then yields an empty
// tree — see AGENTS.md § "Running and testing".
it("does not raise the dialog until someone taps it", async () => {
  signIn();
  await render(<PushEnableCard />);

  // Rendering the card is not asking. The one ask Android 13+ allows must be
  // spent on a deliberate tap, never on a screen appearing.
  expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();

  fireEvent.press(screen.getByText("Turn on alerts"));
  await waitFor(() => expect(mocked.requestPermissionsAsync).toHaveBeenCalled());
});
