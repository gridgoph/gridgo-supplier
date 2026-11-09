import {
  actorForEntry,
  actorLabel,
  inviteTarget,
  inviteTimeLeft,
  isLiveInvite,
  joinTeamLink,
  normalizeInviteIdentity,
  pendingCount,
  readOrderActions,
  teamSections,
  tokenFromLink,
  type TeamInvite,
  type TeamMember,
} from "@/lib/shopTeam";
import { qrPath } from "@/lib/qrMatrix";

const TOKEN = "abcDEF123_-abcDEF123_-abcDEF123_-abcDEF123_";

describe("join links", () => {
  it("puts the token in the fragment of the shared join address", () => {
    expect(joinTeamLink(TOKEN)).toBe(`https://gridgo-dash.talasora.com/join-team#token=${TOKEN}`);
  });

  it("reads the token from the shared link, the app scheme, a bare token or token=…", () => {
    expect(tokenFromLink(joinTeamLink(TOKEN))).toBe(TOKEN);
    expect(tokenFromLink(`gridgosupplier://join-team#token=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromLink(`  ${TOKEN}  `)).toBe(TOKEN);
    expect(tokenFromLink(`token=${TOKEN}`)).toBe(TOKEN);
  });

  it("finds nothing in an unrelated QR or empty text", () => {
    expect(tokenFromLink("https://menu.example.com/coffee")).toBeNull();
    expect(tokenFromLink("")).toBeNull();
    expect(tokenFromLink(null)).toBeNull();
    expect(tokenFromLink("https://x.test/#token=<script>")).toBeNull();
  });

  it("encodes the join link as a scannable QR path", () => {
    const { size, path } = qrPath(joinTeamLink(TOKEN));
    expect(size).toBeGreaterThanOrEqual(21);
    expect(path.startsWith("M")).toBe(true);
  });
});

describe("invite expiry", () => {
  const now = Date.parse("2026-11-09T08:00:00.000Z");

  it("says hours left, then minutes in the last hour, then nothing", () => {
    expect(inviteTimeLeft("2026-11-11T08:00:00.000Z", now)).toBe("48h");
    expect(inviteTimeLeft("2026-11-09T08:45:00.000Z", now)).toBe("45m");
    expect(inviteTimeLeft("2026-11-09T07:59:00.000Z", now)).toBeNull();
  });

  it("treats an open invite past its time as no longer live", () => {
    const invite = { status: "open", expiresAt: "2026-11-09T07:00:00.000Z" } as TeamInvite;
    expect(isLiveInvite(invite, now)).toBe(false);
    expect(isLiveInvite({ ...invite, expiresAt: "2026-11-10T07:00:00.000Z" }, now)).toBe(true);
    expect(isLiveInvite({ ...invite, status: "claimed", expiresAt: "2026-11-10T07:00:00.000Z" }, now)).toBe(false);
  });

  it("names what an invite was sent to", () => {
    expect(inviteTarget({ kind: "email", identity: "sam@example.com" })).toBe("sam@example.com");
    expect(inviteTarget({ kind: "qr", identity: null })).toBe("QR code");
    expect(inviteTarget({ kind: "link", identity: null })).toBe("Share link");
  });
});

describe("the team list", () => {
  const member = (userId: string, name: string, role: "owner" | "staff", status: TeamMember["status"]) =>
    ({ userId, name, role, status, createdAt: "", updatedAt: "" }) as TeamMember;

  it("puts people waiting first, owners above staff, and leaves the removed out", () => {
    const members = [
      member("u3", "Zed", "staff", "active"),
      member("u1", "Ana", "owner", "active"),
      member("u4", "Bea", "staff", "pending"),
      member("u5", "Cy", "staff", "removed"),
    ];
    const { pending, active } = teamSections(members);
    expect(pending.map((m) => m.name)).toEqual(["Bea"]);
    expect(active.map((m) => m.name)).toEqual(["Ana", "Zed"]);
    expect(pendingCount(members)).toBe(1);
  });
});

describe("who did it", () => {
  it("names shop members with their role, others by their part", () => {
    expect(actorLabel({ name: "Sam Santos", role: "staff" })).toBe("Sam Santos (Staff)");
    expect(actorLabel({ name: "Ana Cruz", role: "owner" })).toBe("Ana Cruz (Owner)");
    expect(actorLabel({ role: "system" })).toBe("GRIDGO");
    expect(actorLabel({ name: "Op", role: "ops_admin" })).toBe("Operations");
    expect(actorLabel(null)).toBeNull();
  });

  it("uses the entry's own actor, else an action by the same recorded person at the same moment", () => {
    const actions = readOrderActions([
      { id: "a1", at: "2026-11-08T08:00:00.000Z", action: "order.transition", actor: { userId: "user_sam", name: "Sam", role: "staff" } },
      "not an action",
    ]);
    expect(actorForEntry({ at: "2026-11-08T08:00:00.400Z", by: "user_sam" }, actions)).toEqual({
      userId: "user_sam",
      name: "Sam",
      role: "staff",
    });
    expect(actorForEntry({ at: "2026-11-08T09:00:00.000Z", by: "user_sam" }, actions)).toBeNull();
    expect(actorForEntry({ at: "x", actor: { name: "Ana", role: "owner" } }, actions)).toEqual({
      name: "Ana",
      role: "owner",
    });
  });

  it("never names a person from the time alone", () => {
    const at = "2026-11-08T08:00:00.000Z";
    const actions = readOrderActions([
      { id: "a1", at, action: "order.updated", actor: { userId: "owner", name: "Alex", role: "owner" } },
    ]);
    // The Owner's quote and GRIDGO's checkout notice share one instant.
    expect(actorForEntry({ at, by: "system" }, actions)).toEqual({ role: "system" });
    expect(actorLabel(actorForEntry({ at, by: "system" }, actions))).toBe("GRIDGO");
    // An entry with no recorded author, or another author, borrows nobody.
    expect(actorForEntry({ at }, actions)).toBeNull();
    expect(actorForEntry({ at, by: "user_client" }, actions)).toBeNull();
    expect(actorForEntry({ at, by: "owner" }, actions)).toEqual({ userId: "owner", name: "Alex", role: "owner" });
  });

  it("picks only the recorded author when several people acted within the second", () => {
    const actions = readOrderActions([
      { id: "a1", at: "2026-11-08T08:00:00.100Z", action: "order.transition", actor: { userId: "owner", name: "Alex", role: "owner" } },
      { id: "a2", at: "2026-11-08T08:00:00.300Z", action: "order.transition", actor: { userId: "user_sam", name: "Sam", role: "staff" } },
      { id: "a3", at: "2026-11-08T08:00:00.500Z", action: "order.transition", actor: { userId: "user_ops", name: "Op", role: "ops_admin" } },
    ]);
    const at = "2026-11-08T08:00:00.200Z";
    expect(actorForEntry({ at, by: "owner" }, actions)?.name).toBe("Alex");
    expect(actorForEntry({ at, by: "user_sam" }, actions)?.name).toBe("Sam");
    expect(actorForEntry({ at, by: "someone_else" }, actions)).toBeNull();
    expect(actorForEntry({ at }, actions)).toBeNull();
  });
});

describe("invite addresses", () => {
  it("lower-cases an email and refuses a malformed one", () => {
    expect(normalizeInviteIdentity("email", " Sam@Example.COM ")).toBe("sam@example.com");
    expect(normalizeInviteIdentity("email", "sam@")).toBeNull();
  });

  it("turns a Philippine mobile into E.164", () => {
    expect(normalizeInviteIdentity("phone", "0917 123 4567")).toBe("+639171234567");
    expect(normalizeInviteIdentity("phone", "+63 917 123 4567")).toBe("+639171234567");
    expect(normalizeInviteIdentity("phone", "12345")).toBeNull();
  });
});
