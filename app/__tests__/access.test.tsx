import { render, screen } from "@testing-library/react-native";
import AccessScreen from "@/app/access";
import { ACCESS_WITHDRAWN_MESSAGE, useSession } from "@/store/session";

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
