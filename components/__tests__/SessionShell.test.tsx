import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { SessionShell } from "@/components/SessionShell";
import { useSession } from "@/store/session";

const tabs = (
  <>
    <Text>Home</Text>
    <Text>Jobs</Text>
    <Text>Schedule</Text>
    <Text>Catalogues</Text>
    <Text>Account</Text>
  </>
);

afterEach(() => {
  useSession.setState({ user: null });
});

describe("suspended /auth/me", () => {
  it("renders the reason and does not render the main tabs", async () => {
    useSession.setState({
      user: {
        id: "user_shop",
        email: "shop@gridgo.test",
        name: "North Press",
        role: "supplier",
        accountStatus: "suspended",
        accountStatusReason: "Counter was closed",
      },
    });

    await render(<SessionShell>{tabs}</SessionShell>);

    expect(screen.getByText("This account is suspended.")).toBeTruthy();
    expect(screen.getByText("Counter was closed")).toBeTruthy();
    expect(screen.getByText("Sign out")).toBeTruthy();
    expect(screen.queryByText("Home")).toBeNull();
    expect(screen.queryByText("Jobs")).toBeNull();
    expect(screen.queryByText("Schedule")).toBeNull();
    expect(screen.queryByText("Catalogues")).toBeNull();
    expect(screen.queryByText("Account")).toBeNull();
  });
});
