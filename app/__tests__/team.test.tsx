import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(() => callback(), [callback]);
  },
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => true) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getShopTeam: jest.fn(),
  createShopInvite: jest.fn(),
  revokeShopInvite: jest.fn(async () => undefined),
  updateShopMember: jest.fn(async () => ({})),
  removeShopMember: jest.fn(async () => undefined),
  replaceShopInvite: jest.fn(),
  updateTeamSettings: jest.fn(),
}));

import { Linking, Share } from "react-native";
import TeamScreen from "@/app/team";
import TeamInviteScreen from "@/app/team-invite";
import * as api from "@/lib/api";
import { joinTeamLink } from "@/lib/shopTeam";
import { useSession } from "@/store/session";
import { askConfirm } from "@/store/sheets";

const inTwoDays = () => new Date(Date.now() + 47.5 * 3_600_000).toISOString();

const team = () => ({
  members: [
    { userId: "supplier_123", name: "Ana Cruz", role: "owner", status: "active", createdAt: "", updatedAt: "" },
    { userId: "user_staff", name: "Ben Reyes", role: "staff", status: "active", createdAt: "", updatedAt: "" },
    { userId: "user_new", name: "Sam Santos", role: "staff", status: "pending", createdAt: "", updatedAt: "" },
    { userId: "user_gone", name: "Old Hand", role: "staff", status: "removed", createdAt: "", updatedAt: "" },
  ],
  invites: [
    { id: "shi_open", shopId: "supplier_123", kind: "email", identity: "joy@example.com", createdAt: "", expiresAt: inTwoDays(), status: "open" },
    { id: "shi_used", shopId: "supplier_123", kind: "qr", identity: null, createdAt: "", expiresAt: inTwoDays(), status: "claimed" },
  ],
});

/** The extended contract (report F315793B): PIN staff, the week, settings. */
const teamV2 = (overrides: Record<string, unknown> = {}) => ({
  ...team(),
  shop: { id: "supplier_123", name: "Print Hub" },
  members: [
    ...team().members.map((member) => ({ ...member, kind: "account", jobAlerts: true, photoFileId: null })),
    { userId: "user_mgr", name: "Rey Lim", role: "manager", status: "active", kind: "account", jobAlerts: true, photoFileId: null, createdAt: "", updatedAt: "" },
  ],
  pinStaff: [
    { id: "shp_lito", pinStaffId: "shp_lito", kind: "pin", name: "Lito", role: "staff", status: "active", jobAlerts: true, photoFileId: null, onShift: true, createdAt: "", updatedAt: "" },
  ],
  stats: {
    fastestThisWeek: { pinStaffId: "shp_lito", name: "Lito", badge: "fastest_this_week" },
    mission: { code: "accept_within_five_minutes", targetJobs: 10, acceptedJobs: 6, quickAcceptedJobs: 4, completed: false },
    members: [{ pinStaffId: "shp_lito", name: "Lito", jobsThisWeek: 23, acceptedJobs: 20, averageAcceptSeconds: 38 }],
  },
  settings: { jobsHandledBy: "me_and_staff", showRankingToStaff: true },
  ...overrides,
});

const asTeam = (raw: unknown) => jest.requireActual("@/lib/teamRoster").readShopTeam(raw);

function signInAs(shopRole?: "staff" | "manager") {
  useSession.setState({
    user: {
      id: shopRole ? "user_me" : "supplier_123",
      email: "me@shop.ph",
      name: "Me",
      role: "supplier",
      verificationStatus: "approved",
      ...(shopRole ? { shopRole, shopId: "supplier_123", shopStatus: "active" as const } : {}),
    },
    identity: { kind: "supplier" },
    authSource: "clerk",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (api.getShopTeam as jest.Mock).mockResolvedValue(asTeam(team()));
  signInAs();
});

describe("the Owner's team", () => {
  it("shows the shop card, who waits, the staff and open invites with their time left", async () => {
    await render(<TeamScreen />);
    expect(await screen.findByText("Sam Santos")).toBeTruthy();
    expect(screen.getByTestId("team-shop-card")).toBeTruthy();
    expect(screen.getByLabelText("Ana Cruz (you), Owner")).toBeTruthy();
    expect(screen.getByText("Ben Reyes")).toBeTruthy();
    expect(screen.queryByText("Old Hand")).toBeNull();
    expect(screen.getByText("joy@example.com")).toBeTruthy();
    expect(screen.getByText("47h left")).toBeTruthy();
    // A claimed invite is no longer open.
    expect(screen.queryByText("QR code")).toBeNull();
  });

  it("hides the PIN, the shop phone and the weekly view from an older GRIDGO", async () => {
    await render(<TeamScreen />);
    await screen.findByText("Ben Reyes");
    expect(screen.getByText("Send link")).toBeTruthy();
    expect(screen.getByText("Show QR")).toBeTruthy();
    expect(screen.queryByText("Staff without a phone or account")).toBeNull();
    expect(screen.queryByText("Use this phone for PIN staff")).toBeNull();
    expect(screen.queryByTestId("team-week-card")).toBeNull();
    expect(screen.queryByText("Show the fastest badge to staff")).toBeNull();
  });

  it("approves a waiting person", async () => {
    await render(<TeamScreen />);
    await screen.findByText("Sam Santos");
    await act(async () => {
      fireEvent.press(screen.getByText("Approve"));
    });
    expect(api.updateShopMember).toHaveBeenCalledWith("user_new", { status: "active" });
    await waitFor(() => expect(api.getShopTeam).toHaveBeenCalledTimes(2));
  });

  it("declines only after asking, naming the person", async () => {
    (askConfirm as jest.Mock).mockResolvedValueOnce(false);
    await render(<TeamScreen />);
    await screen.findByText("Sam Santos");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Decline Sam Santos"));
    });
    expect(askConfirm).toHaveBeenLastCalledWith(expect.objectContaining({ question: "Decline Sam Santos?" }));
    expect(api.removeShopMember).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Decline Sam Santos"));
    });
    expect(api.removeShopMember).toHaveBeenCalledWith("user_new");
  });

  it("cancels an open invite", async () => {
    await render(<TeamScreen />);
    await screen.findByText("joy@example.com");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Cancel the invite for joy@example.com"));
    });
    expect(api.revokeShopInvite).toHaveBeenCalledWith("shi_open");
  });

  it("says a refusal in words, never a code", async () => {
    (api.updateShopMember as jest.Mock).mockRejectedValueOnce(new api.ApiError(409, { error: "last_shop_owner" }));
    await render(<TeamScreen />);
    await screen.findByText("Sam Santos");
    await act(async () => {
      fireEvent.press(screen.getByText("Approve"));
    });
    expect(await screen.findByText(/at least one owner/)).toBeTruthy();
    expect(screen.queryByText(/last_shop_owner/)).toBeNull();
  });

  it("sends a 24-hour link through the phone's own share sheet", async () => {
    (api.createShopInvite as jest.Mock).mockResolvedValue({
      invite: { id: "shi_link", shopId: "supplier_123", kind: "link", identity: null, createdAt: "", expiresAt: inTwoDays(), status: "open" },
      token: "tokenTOKENtoken_tokenTOKENtoken_tokenTOKEN1",
    });
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    await render(<TeamScreen />);
    await screen.findByText("Ben Reyes");
    await act(async () => {
      fireEvent.press(screen.getByText("Send link"));
    });
    expect(api.createShopInvite).toHaveBeenCalledWith("link");
    expect(share).toHaveBeenCalledWith({
      message: expect.stringContaining(joinTeamLink("tokenTOKENtoken_tokenTOKENtoken_tokenTOKEN1")),
    });
  });

  it("offers a QR and a PIN person as the other two ways", async () => {
    const { router } = jest.requireMock("expo-router") as { router: { push: jest.Mock } };
    (api.getShopTeam as jest.Mock).mockResolvedValue(asTeam(teamV2()));
    await render(<TeamScreen />);
    await screen.findByText("Lito");
    await act(async () => {
      fireEvent.press(screen.getByText("Show QR"));
    });
    expect(router.push).toHaveBeenLastCalledWith({ pathname: "/team-invite", params: { kind: "qr" } });
    await act(async () => {
      fireEvent.press(screen.getByText("Staff without a phone or account"));
    });
    expect(router.push).toHaveBeenLastCalledWith("/team-pin");
  });
});

describe("the team view, positive only", () => {
  it("shows the Owner the fastest person with their speed, the mission and who is on shift", async () => {
    (api.getShopTeam as jest.Mock).mockResolvedValue(asTeam(teamV2()));
    await render(<TeamScreen />);
    expect(await screen.findByText("Fastest this week: Lito")).toBeTruthy();
    expect(screen.getByText("Accepts in 38 sec on average · 23 jobs")).toBeTruthy();
    expect(screen.getByText("Team mission: accept 10 jobs within 5 minutes this week")).toBeTruthy();
    expect(screen.getByText("4 of 10 so far")).toBeTruthy();
    expect(screen.getByText("1 on shift")).toBeTruthy();
    expect(screen.getByLabelText("Rey Lim, Manager")).toBeTruthy();
    expect(screen.queryByText(/slowest/i)).toBeNull();
  });

  it("lets only the Owner hide the ranking from staff", async () => {
    (api.getShopTeam as jest.Mock).mockResolvedValue(asTeam(teamV2()));
    (api.updateTeamSettings as jest.Mock).mockResolvedValue({ jobsHandledBy: "me_and_staff", showRankingToStaff: false });
    await render(<TeamScreen />);
    await screen.findByText("Lito");
    await act(async () => {
      fireEvent.press(screen.getByRole("switch", { name: "Show the fastest badge to staff" }));
    });
    expect(api.updateTeamSettings).toHaveBeenCalledWith({ showRankingToStaff: false });

    signInAs("manager");
    await render(<TeamScreen />);
    await screen.findAllByText("Lito");
    expect(screen.queryByRole("switch", { name: "Show the fastest badge to staff" })).toBeNull();
  });

  it("shows Staff the badge and the mission, never anyone's speed, and no way to manage", async () => {
    signInAs("staff");
    const { members: _speeds, ...staffStats } = teamV2().stats;
    (api.getShopTeam as jest.Mock).mockResolvedValue(
      asTeam(teamV2({ stats: staffStats, invites: undefined, members: teamV2().members.filter((m) => m.status === "active") })),
    );
    await render(<TeamScreen />);
    expect(await screen.findByText("Fastest this week: Lito")).toBeTruthy();
    expect(screen.queryByText(/on average/)).toBeNull();
    expect(screen.getByText(/Team mission/)).toBeTruthy();
    expect(screen.queryByText("Send link")).toBeNull();
    expect(screen.queryByText("Use this phone for PIN staff")).toBeNull();
    expect(screen.queryByText("Sam Santos")).toBeNull();
  });

  it("drops the badge when the Owner hid the ranking, keeping the mission", async () => {
    signInAs("staff");
    (api.getShopTeam as jest.Mock).mockResolvedValue(
      asTeam(teamV2({ stats: { ...teamV2().stats, fastestThisWeek: null, members: undefined } })),
    );
    await render(<TeamScreen />);
    expect(await screen.findByText(/Team mission/)).toBeTruthy();
    expect(screen.queryByText(/Fastest this week/)).toBeNull();
  });

  it("lets a Manager add staff but never offers Manager-only Owner settings", async () => {
    signInAs("manager");
    (api.getShopTeam as jest.Mock).mockResolvedValue(asTeam(teamV2()));
    await render(<TeamScreen />);
    await screen.findByText("Fastest this week: Lito");
    expect(screen.getByText("Send link")).toBeTruthy();
    expect(screen.getByText("Staff without a phone or account")).toBeTruthy();
    expect(screen.queryByText("Show the fastest badge to staff")).toBeNull();
  });
});

describe("adding staff", () => {
  const made = (kind: string, identity: string | null = null) => ({
    invite: { id: "shi_new", shopId: "supplier_123", kind, identity, createdAt: "", expiresAt: inTwoDays(), status: "open" },
    token: "tokenTOKENtoken_tokenTOKENtoken_tokenTOKEN1",
  });

  it("shows a QR of the join link, with its time left and single use", async () => {
    (api.createShopInvite as jest.Mock).mockResolvedValue(made("qr"));
    await render(<TeamInviteScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText("Show QR code"));
    });
    expect(api.createShopInvite).toHaveBeenCalledWith("qr", undefined);
    expect(screen.getByLabelText("QR code to join your shop's team")).toBeTruthy();
    expect(screen.getByText("47h left")).toBeTruthy();
    expect(screen.getByText("Works once")).toBeTruthy();
    expect(screen.getByText(joinTeamLink("tokenTOKENtoken_tokenTOKENtoken_tokenTOKEN1"))).toBeTruthy();
  });

  it("opens the share sheet with the link", async () => {
    (api.createShopInvite as jest.Mock).mockResolvedValue(made("link"));
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    await render(<TeamInviteScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole("radio", { name: "Link" }));
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Share link"));
    });
    expect(api.createShopInvite).toHaveBeenCalledWith("link", undefined);
    expect(share).toHaveBeenCalledWith({
      message: expect.stringContaining(joinTeamLink("tokenTOKENtoken_tokenTOKENtoken_tokenTOKEN1")),
    });
  });

  it("invites by phone in E.164 and refuses a number it cannot read", async () => {
    (api.createShopInvite as jest.Mock).mockResolvedValue(made("phone", "+639171234567"));
    await render(<TeamInviteScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole("radio", { name: "Phone" }));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Their mobile number"), "12");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Invite"));
    });
    expect(api.createShopInvite).not.toHaveBeenCalled();
    expect(screen.getByText(/Check the number/)).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Their mobile number"), "0917 123 4567");
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Invite"));
    });
    expect(api.createShopInvite).toHaveBeenCalledWith("phone", "+639171234567");
    expect(screen.getByText("+639171234567")).toBeTruthy();
  });

  it("swaps the shown QR for a new code only after GRIDGO replaced it", async () => {
    const oldLink = joinTeamLink("tokenTOKENtoken_tokenTOKENtoken_tokenTOKEN1");
    const newToken = "freshFRESHfresh_freshFRESHfresh_freshFRESH2";
    (api.createShopInvite as jest.Mock).mockResolvedValue(made("qr"));
    (api.replaceShopInvite as jest.Mock)
      .mockRejectedValueOnce(new api.ApiError(409, { error: "shop_invite_used" }))
      .mockResolvedValueOnce({ ...made("qr"), invite: { ...made("qr").invite, id: "shi_next" }, token: newToken });
    await render(<TeamInviteScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText("Show QR code"));
    });

    // A refusal keeps the code on screen and says why, to the Owner.
    await act(async () => {
      fireEvent.press(screen.getByText("New code"));
    });
    expect(askConfirm).toHaveBeenCalledWith(expect.objectContaining({ question: "Make a new QR code?" }));
    expect(api.replaceShopInvite).toHaveBeenCalledWith("shi_new");
    expect(screen.getByText(oldLink)).toBeTruthy();
    expect(screen.getByText(/Someone already joined with this code/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText("New code"));
    });
    expect(screen.queryByText(oldLink)).toBeNull();
    expect(screen.getByText(joinTeamLink(newToken))).toBeTruthy();
    expect(screen.queryByText(/Someone already joined/)).toBeNull();
  });

  it("keeps the code when the Owner backs out of New code", async () => {
    (api.createShopInvite as jest.Mock).mockResolvedValue(made("link"));
    (askConfirm as jest.Mock).mockResolvedValueOnce(false);
    jest.spyOn(Share, "share").mockResolvedValue({ action: "dismissedAction" });
    await render(<TeamInviteScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole("radio", { name: "Link" }));
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Share link"));
    });
    await act(async () => {
      fireEvent.press(screen.getByText("New code"));
    });
    expect(askConfirm).toHaveBeenLastCalledWith(expect.objectContaining({ question: "Make a new link?" }));
    expect(api.replaceShopInvite).not.toHaveBeenCalled();
  });

  it("sends the link in Messenger, and copies it when Messenger does not open", async () => {
    const link = joinTeamLink("tokenTOKENtoken_tokenTOKENtoken_tokenTOKEN1");
    (api.createShopInvite as jest.Mock).mockResolvedValue(made("qr"));
    const open = jest.spyOn(Linking, "openURL").mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("no app"));
    const { setStringAsync } = jest.requireMock("expo-clipboard") as { setStringAsync: jest.Mock };
    await render(<TeamInviteScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText("Show QR code"));
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Send in Messenger"));
    });
    expect(open).toHaveBeenCalledWith(`fb-messenger://share/?link=${encodeURIComponent(link)}`);
    expect(screen.queryByText(/Messenger did not open/)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText("Send in Messenger"));
    });
    expect(setStringAsync).toHaveBeenCalledWith(link);
    expect(screen.getByText(/Messenger did not open. Link copied/)).toBeTruthy();
  });

  it.each([
    ["email", "Email", "Their email", "joy@example.com", "joy@example.com"],
    ["phone", "Phone", "Their mobile number", "0917 123 4567", "+639171234567"],
  ])("makes a new code for an %s invite, to the same person", async (kind, tab, field, typed, identity) => {
    (api.createShopInvite as jest.Mock).mockResolvedValue(made(kind, identity));
    (api.replaceShopInvite as jest.Mock).mockResolvedValue({
      ...made(kind, identity),
      invite: { ...made(kind, identity).invite, id: "shi_next" },
      token: "freshFRESHfresh_freshFRESHfresh_freshFRESH2",
    });
    await render(<TeamInviteScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole("radio", { name: tab }));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText(field), typed);
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Invite"));
    });
    await act(async () => {
      fireEvent.press(screen.getByText("New code"));
    });
    expect(askConfirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ question: `Make a new invite for ${identity}?` }),
    );
    expect(api.replaceShopInvite).toHaveBeenCalledWith("shi_new");
    expect(screen.getByText(joinTeamLink("freshFRESHfresh_freshFRESHfresh_freshFRESH2"))).toBeTruthy();
    expect(screen.getByText(identity)).toBeTruthy();
  });
});
