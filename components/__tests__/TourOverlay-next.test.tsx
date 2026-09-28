import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { TourOverlay } from "@/components/TourOverlay";
import type { User } from "@/lib/api";
import { useSession } from "@/store/session";
import { useTour } from "@/store/tour";

/** Next moves to the following tip on the same screen; Back is offered there. */

beforeEach(() => {
  useSession.setState({
    user: { id: "usr_a", email: "a@lovisprint.ph", name: "Ana", role: "supplier" } as User,
  });
  useTour.getState().reset();
  useTour.setState({ hydrated: true, progress: { usr_a: { status: "active", step: 0 } } });
});

it("walks the catalogue: Add a listing, then Edit, with Back to Add", async () => {
  // A shop that tapped Catalogues early is met by the catalogue's first step.
  useTour.getState().arrive("usr_a", "catalogue");
  await render(<Overlay />);
  expect(await screen.findByText("Add a listing")).toBeTruthy();
  expect(screen.getByLabelText("Tip 6 of 9")).toBeTruthy();
  expect(screen.queryByText("Back")).toBeNull();

  fireEvent.press(screen.getByText("Next"));

  expect(await screen.findByText("Edit a listing any time", {}, { timeout: 2000 })).toBeTruthy();
  expect(screen.getByText("Back")).toBeTruthy();
  expect(screen.getByText("Got it")).toBeTruthy();
  await waitFor(() =>
    expect(useTour.getState().progress.usr_a).toEqual({ status: "active", step: 6 }),
  );
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Overlay() {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <TourOverlay ready />
    </SafeAreaProvider>
  );
}
