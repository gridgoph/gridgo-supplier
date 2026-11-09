import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

import { router } from "expo-router";
import AccessScreen from "@/app/access";
import { ACCESS_WITHDRAWN_MESSAGE, TEAM_REMOVED_MESSAGE, useSession } from "@/store/session";
import { useTeamJoin } from "@/store/teamJoin";

it("names the other app for a role mismatch", async () => {
  useSession.setState({ identity: { kind: "mismatch", destination: "GRIDGO Rider" } });
  await render(<AccessScreen />);
  expect(screen.getByText("This account belongs to a different GRIDGO app")).toBeTruthy();
  expect(screen.getByText(/Open GRIDGO Rider/)).toBeTruthy();
  expect(screen.queryByText("This shop is still closed")).toBeNull();
});

it("explains withdrawn access and points to Operations", async () => {
  useSession.setState({ identity: { kind: "error", reason: "access_withdrawn", message: ACCESS_WITHDRAWN_MESSAGE } });
  await render(<AccessScreen />);
  expect(screen.getByText("Supplier access was withdrawn")).toBeTruthy();
  expect(screen.getByText(/Contact Operations/)).toBeTruthy();
  expect(screen.queryByText("This shop is still closed")).toBeNull();
});

it("tells a removed teammate plainly and offers a new invite", async () => {
  useTeamJoin.getState().clear();
  useSession.setState({ identity: { kind: "error", reason: "team_removed", message: TEAM_REMOVED_MESSAGE } });
  await render(<AccessScreen />);
  expect(screen.getByText("You are off the team")).toBeTruthy();
  expect(screen.getByText(/The owner removed you from the shop/)).toBeTruthy();
  fireEvent.press(screen.getByText("Join a team"));
  expect(router.push).toHaveBeenCalledWith("/join-team");
  expect(useTeamJoin.getState().joining).toBe(true);
});
