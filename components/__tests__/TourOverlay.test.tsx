import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { TourOverlay } from "@/components/TourOverlay";
import type { User } from "@/lib/api";
import { useAppUpdate } from "@/store/appUpdate";
import { usePushPrompt } from "@/store/pushPrompt";
import { useSession } from "@/store/session";
import { useTour } from "@/store/tour";

/** The card over a screen: the step for that screen only, and Skip always there. */

beforeEach(() => {
  useSession.setState({
    user: { id: "usr_a", email: "a@lovisprint.ph", name: "Ana", role: "supplier" } as User,
  });
  useTour.getState().reset();
  useTour.setState({ hydrated: true, progress: { usr_a: { status: "active", step: 0 } } });
  usePushPrompt.setState({ sheetOpen: false });
  useAppUpdate.setState({ sheetOpen: false, completed: null, offer: null });
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 600));

it("draws nothing on a screen the current step does not belong to", async () => {
  // Set directly: arriving at a screen would move the tour up to meet it.
  useTour.setState({ screen: "schedule" });
  await render(<Overlay />);
  await settle();
  expect(screen.queryByText("New jobs arrive in Jobs")).toBeNull();
});

it("waits while the notifications explainer is up", async () => {
  usePushPrompt.setState({ sheetOpen: true });
  useTour.getState().arrive("usr_a", "home");
  await render(<Overlay />);
  await settle();
  expect(screen.queryByText("New jobs arrive in Jobs")).toBeNull();
});

it("waits while the update sheet is up", async () => {
  useAppUpdate.setState({ sheetOpen: true });
  useTour.getState().arrive("usr_a", "home");
  await render(<Overlay />);
  await settle();
  expect(screen.queryByText("New jobs arrive in Jobs")).toBeNull();
});

it("draws nothing until the opening has played", async () => {
  useTour.getState().arrive("usr_a", "home");
  await render(<Overlay ready={false} />);
  await settle();
  expect(screen.queryByText("New jobs arrive in Jobs")).toBeNull();
});

it("shows the step on its screen with dots and Skip, and Skip ends the tour", async () => {
  useTour.getState().arrive("usr_a", "home");
  await render(<Overlay />);

  expect(await screen.findByText("New jobs arrive in Jobs")).toBeTruthy();
  expect(screen.getByLabelText("Tip 1 of 9")).toBeTruthy();
  // Home's only step: the card goes away until the shop reaches Jobs.
  expect(screen.getByText("Got it")).toBeTruthy();
  expect(screen.queryByText("Back")).toBeNull();

  fireEvent.press(screen.getByLabelText("Skip the tour"));
  await waitFor(() => expect(useTour.getState().progress.usr_a).toEqual({ status: "done" }));
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Overlay({ ready = true }: { ready?: boolean }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <TourOverlay ready={ready} />
    </SafeAreaProvider>
  );
}
