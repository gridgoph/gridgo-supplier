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
}));

import { Share } from "react-native";
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

beforeEach(() => {
  jest.clearAllMocks();
  (api.getShopTeam as jest.Mock).mockResolvedValue(team());
  useSession.setState({
    user: { id: "supplier_123", email: "ana@shop.ph", name: "Ana Cruz", role: "supplier", verificationStatus: "approved" },
    identity: { kind: "supplier" },
    authSource: "clerk",
  });
});

describe("the Owner's team", () => {
  it("lists who waits, who is on the team, and open invites with their time left", async () => {
    await render(<TeamScreen />);
    expect(await screen.findByText("Sam Santos")).toBeTruthy();
    expect(screen.getByText("Ana Cruz (you)")).toBeTruthy();
    expect(screen.getByText("Ben Reyes")).toBeTruthy();
    expect(screen.queryByText("Old Hand")).toBeNull();
    expect(screen.getByText("joy@example.com")).toBeTruthy();
    expect(screen.getByText("47h")).toBeTruthy();
    // A claimed invite is no longer open.
    expect(screen.queryByText("QR code")).toBeNull();
    // Nobody can remove themselves or an Owner from here.
    expect(screen.queryByLabelText("Remove Ana Cruz")).toBeNull();
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

  it("declines and removes only after asking, naming the person", async () => {
    await render(<TeamScreen />);
    await screen.findByText("Sam Santos");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Decline Sam Santos"));
    });
    expect(askConfirm).toHaveBeenLastCalledWith(expect.objectContaining({ question: "Decline Sam Santos?" }));
    expect(api.removeShopMember).toHaveBeenCalledWith("user_new");

    (askConfirm as jest.Mock).mockResolvedValueOnce(false);
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Remove Ben Reyes"));
    });
    expect(api.removeShopMember).not.toHaveBeenCalledWith("user_staff");

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Remove Ben Reyes"));
    });
    expect(askConfirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ question: "Remove Ben Reyes from your team?" }),
    );
    expect(api.removeShopMember).toHaveBeenCalledWith("user_staff");
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
    (api.removeShopMember as jest.Mock).mockRejectedValueOnce(new api.ApiError(409, { error: "last_shop_owner" }));
    await render(<TeamScreen />);
    await screen.findByText("Ben Reyes");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Remove Ben Reyes"));
    });
    expect(await screen.findByText(/at least one owner/)).toBeTruthy();
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
});
