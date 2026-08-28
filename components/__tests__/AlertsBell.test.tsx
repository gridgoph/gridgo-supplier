import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

import { AlertsBell } from "@/components/AlertsBell";
import { router } from "expo-router";
import { useAlertsStore } from "@/store/alerts";

/**
 * The inbox, from the corner of every masthead.
 *
 * Alerts used to be a tab with a badge on it. Both moved here together on
 * purpose: the mark a shop learned in the bar is the mark it now finds in the
 * header, to the same shape and the same cap.
 */
describe("the alerts bell", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    useAlertsStore.setState({ unreadCount: 0 });
  });

  afterEach(async () => {
    await view?.unmount();
    view = undefined;
    useAlertsStore.setState({ unreadCount: 0 });
  });

  it("opens the alerts screen", async () => {
    view = await render(<AlertsBell />);

    await fireEvent.press(screen.getByLabelText("Alerts"));

    expect(router.push).toHaveBeenCalledWith("/alerts");
  });

  /** Nothing waiting draws nothing. A zero badge is a badge nobody reads. */
  it("draws no mark with nothing unread", async () => {
    view = await render(<AlertsBell />);

    expect(screen.getByLabelText("Alerts")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("says how many are waiting, in the label and on the bell", async () => {
    useAlertsStore.setState({ unreadCount: 3 });

    view = await render(<AlertsBell />);

    expect(screen.getByLabelText("Alerts, 3 unread")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  /**
   * Past nine the number stops being a count and starts being a wall, and the
   * answer to either is to open the list. The spoken label keeps the real
   * figure, because a screen reader has room for it.
   */
  it("caps the drawn mark at 9+ and speaks the true count", async () => {
    useAlertsStore.setState({ unreadCount: 12 });

    view = await render(<AlertsBell />);

    expect(screen.getByText("9+")).toBeTruthy();
    expect(screen.getByLabelText("Alerts, 12 unread")).toBeTruthy();
  });
});
