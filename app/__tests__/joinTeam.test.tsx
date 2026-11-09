import { act, fireEvent, render, screen } from "@testing-library/react-native";

let mockSignedIn = true;
jest.mock("@clerk/expo", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: mockSignedIn }),
  useUser: () => ({ user: { firstName: "Sam", lastName: "Santos", primaryEmailAddress: { emailAddress: "sam@example.com" } } }),
}));
jest.mock("expo-linking", () => ({ useLinkingURL: () => null }));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(() => callback(), [callback]);
  },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => true) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  discoverShopInvites: jest.fn(),
  claimShopInvite: jest.fn(),
  me: jest.fn(),
}));

import { router } from "expo-router";
import AccountScreen from "@/app/(tabs)/account";
import JoinTeamScreen from "@/app/join-team";
import TeamWaitingScreen from "@/app/team-waiting";
import { JobTimeline } from "@/components/JobTimeline";
import * as api from "@/lib/api";
import { useSession } from "@/store/session";
import { useTeamJoin } from "@/store/teamJoin";

const TOKEN = "tokenTOKENtoken_tokenTOKENtoken_tokenTOKEN1";
const inTwoDays = () => new Date(Date.now() + 47.5 * 3_600_000).toISOString();
const pendingBootstrap = {
  id: "user_456",
  email: "",
  name: "Sam Santos",
  role: "supplier" as const,
  supplierName: "Print Shop",
  shopId: "supplier_123",
  shopRole: "staff" as const,
  shopStatus: "pending" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSignedIn = true;
  useTeamJoin.getState().clear();
  (api.discoverShopInvites as jest.Mock).mockResolvedValue([]);
  useSession.setState({ user: null, identity: { kind: "unassigned" }, authSource: "clerk", sessionWait: null });
});

describe("joining a team", () => {
  it("asks a signed-out person to sign in or make a login first", async () => {
    mockSignedIn = false;
    await render(<JoinTeamScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText("Create a login"));
    });
    expect(router.push).toHaveBeenCalledWith("/(auth)/join-account");
    await act(async () => {
      fireEvent.press(screen.getByText("Sign in"));
    });
    expect(router.push).toHaveBeenCalledWith("/(auth)/login");
    expect(useTeamJoin.getState().joining).toBe(true);
  });

  it("claims an invite sent to the person's email, then waits for the Owner", async () => {
    (api.discoverShopInvites as jest.Mock).mockResolvedValue([
      {
        id: "shi_1",
        shopId: "supplier_123",
        kind: "email",
        identity: "sam@example.com",
        createdAt: "",
        expiresAt: inTwoDays(),
        status: "open",
        shop: { id: "supplier_123", name: "Print Shop" },
      },
    ]);
    (api.claimShopInvite as jest.Mock).mockResolvedValue({ id: "supplier_123", name: "Print Shop", role: "staff", status: "pending" });
    (api.me as jest.Mock).mockResolvedValue(pendingBootstrap);
    await render(<JoinTeamScreen />);
    expect(await screen.findByText("Print Shop")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText("Join"));
    });
    expect(api.claimShopInvite).toHaveBeenCalledWith({ inviteId: "shi_1" });
    expect(useSession.getState().identity).toEqual({ kind: "team_pending", shopName: "Print Shop" });
    expect(router.replace).toHaveBeenCalledWith("/team-waiting");
  });

  it("claims a scanned or pasted link by its token", async () => {
    (api.claimShopInvite as jest.Mock).mockResolvedValue(null);
    (api.me as jest.Mock).mockResolvedValue(pendingBootstrap);
    await render(<JoinTeamScreen />);
    await act(async () => {
      fireEvent.changeText(
        screen.getByLabelText("Team invite link"),
        `https://gridgo-dash.talasora.com/join-team#token=${TOKEN}`,
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Join with link"));
    });
    expect(api.claimShopInvite).toHaveBeenCalledWith({ token: TOKEN });
  });

  it("says why a used link failed, in words", async () => {
    (api.claimShopInvite as jest.Mock).mockRejectedValue(new api.ApiError(409, { error: "shop_invite_used" }));
    useTeamJoin.getState().holdToken(TOKEN);
    await render(<JoinTeamScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText("Join"));
    });
    expect(screen.getByText("This invite was already used. Ask the owner for a new one.")).toBeTruthy();
    expect(useTeamJoin.getState().token).toBeNull();
  });
});

describe("waiting for the Owner", () => {
  it("opens the shop by itself once the Owner approves", async () => {
    jest.useFakeTimers();
    useSession.setState({ identity: { kind: "team_pending", shopName: "Print Shop" } });
    (api.me as jest.Mock).mockResolvedValue({ ...pendingBootstrap, shopStatus: "active", verificationStatus: "approved" });
    await render(<TeamWaitingScreen />);
    expect(screen.getByText("Waiting for the owner")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    jest.useRealTimers();
    expect(useSession.getState().user?.shopRole).toBe("staff");
    expect(useSession.getState().identity.kind).toBe("supplier");
  });
});

describe("who did it", () => {
  it("names the teammate and their role on each step of the order history", async () => {
    await render(
      <JobTimeline
        timeline={[
          { at: "2026-11-08T08:00:00.000Z", state: "payment_authorized", note: "", actor: { userId: "u", name: "Sam Santos", role: "staff" } },
          { at: "2026-11-08T09:00:00.000Z", state: "in_production", note: "", by: "user_ana" },
          { at: "2026-11-08T09:00:00.000Z", state: "awaiting_checkout", note: "", by: "system" },
        ]}
        actions={[{ id: "a2", at: "2026-11-08T09:00:00.000Z", action: "order.transition", actor: { userId: "user_ana", name: "Ana Cruz", role: "owner" } }]}
      />,
    );
    expect(screen.getByText(/· Sam Santos \(Staff\)$/)).toBeTruthy();
    expect(screen.getAllByText(/· Ana Cruz \(Owner\)$/)).toHaveLength(1);
    expect(screen.getByText(/· GRIDGO$/)).toBeTruthy();
  });
});

describe("a Staff member's account", () => {
  it("shows who they are and whose shop, with none of the Owner's settings", async () => {
    useSession.setState({
      user: { ...pendingBootstrap, shopStatus: "active", verificationStatus: "approved" },
      identity: { kind: "supplier" },
    });
    await render(<AccountScreen />);
    expect(screen.getByText("Sam Santos")).toBeTruthy();
    expect(screen.getByText("Print Shop")).toBeTruthy();
    expect(screen.getByText("Staff")).toBeTruthy();
    for (const ownerOnly of ["Team", "Earnings", "Your board", "Shop hours & closures", "Where you get paid", "Report a problem"]) {
      expect(screen.queryByText(ownerOnly)).toBeNull();
    }
  });
});
