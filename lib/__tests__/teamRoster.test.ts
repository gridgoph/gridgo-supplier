import { ApiError } from "@/lib/api";
import {
  acceptSpeedLabel,
  canChangeRole,
  canManagePerson,
  canManageTeam,
  isPin,
  missionProgress,
  pinFormProblem,
  pinNameProblem,
  readShopTeam,
  teamLayout,
  type TeamPerson,
} from "@/lib/teamRoster";

const person = (over: Partial<TeamPerson>): TeamPerson => ({
  key: "k",
  kind: "account",
  name: "Name",
  role: "staff",
  status: "active",
  jobAlerts: true,
  photoFileId: null,
  onShift: false,
  createdAt: "",
  ...over,
});

describe("reading the team", () => {
  it("treats an older GRIDGO with no pinStaff as having no PIN staff, stats or settings", () => {
    const team = readShopTeam({ members: [{ userId: "u1", name: "Ana", role: "owner", status: "active" }], invites: [] });
    expect(team.hasPinStaff).toBe(false);
    expect(team.stats).toBeNull();
    expect(team.settings).toBeNull();
    expect(team.people.map((p) => p.name)).toEqual(["Ana"]);
  });

  it("joins logins and PIN staff into one list and keeps per-person speed only when GRIDGO sends it", () => {
    const team = readShopTeam({
      members: [{ userId: "u1", name: "Ana", role: "owner", status: "active", kind: "account" }],
      pinStaff: [{ id: "shp_1", name: "Lito", role: "staff", status: "active", onShift: true }],
      stats: { fastestThisWeek: { pinStaffId: "shp_1", name: "Lito" }, mission: { targetJobs: 10, acceptedJobs: 3, quickAcceptedJobs: 2, completed: false } },
    });
    expect(team.hasPinStaff).toBe(true);
    expect(team.people.find((p) => p.key === "shp_1")?.kind).toBe("pin");
    expect(team.stats?.members).toBeNull();
    expect(team.stats?.fastest?.name).toBe("Lito");
  });

  it("puts the owner before managers, and keeps waiting logins apart", () => {
    const layout = teamLayout([
      person({ key: "m", name: "Rey", role: "manager" }),
      person({ key: "o", name: "Zed", role: "owner" }),
      person({ key: "s", name: "Ben", onShift: true }),
      person({ key: "w", name: "Sam", status: "pending" }),
      person({ key: "r", name: "Old", status: "removed" }),
    ]);
    expect(layout.leads.map((p) => p.key)).toEqual(["o", "m"]);
    expect(layout.staff.map((p) => p.key)).toEqual(["s"]);
    expect(layout.waiting.map((p) => p.key)).toEqual(["w"]);
    expect(layout.onShift).toBe(1);
  });
});

describe("who may change whom", () => {
  it("lets Owners and Managers run the team, never Staff", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("manager")).toBe(true);
    expect(canManageTeam("staff")).toBe(false);
  });

  it("lets a Manager manage Staff only, and nobody manage themselves or an Owner", () => {
    const staff = person({ key: "s" });
    const manager = person({ key: "m", role: "manager" });
    const owner = person({ key: "o", role: "owner" });
    expect(canManagePerson("manager", staff, "m")).toBe(true);
    expect(canManagePerson("manager", manager, "x")).toBe(false);
    expect(canManagePerson("owner", manager, "o")).toBe(true);
    expect(canManagePerson("owner", owner, "x")).toBe(false);
    expect(canManagePerson("owner", staff, "s")).toBe(false);
    expect(canManagePerson("staff", staff, "x")).toBe(false);
  });

  it("lets only an Owner make someone a Manager", () => {
    expect(canChangeRole("owner", person({}))).toBe(true);
    expect(canChangeRole("manager", person({}))).toBe(false);
  });
});

describe("words", () => {
  it.each([
    [0.4, "1 sec"],
    [38, "38 sec"],
    [240, "4 min"],
    [3900, "1 hr 5 min"],
    [null, null],
    [-1, null],
  ])("says %p seconds as %p", (seconds, words) => {
    expect(acceptSpeedLabel(seconds)).toBe(words);
  });

  it("caps the mission's progress at its target", () => {
    expect(missionProgress({ code: "m", targetJobs: 10, acceptedJobs: 14, quickAcceptedJobs: 12, completed: true })).toEqual({
      done: 10,
      target: 10,
      fraction: 1,
    });
  });

  it("takes a PIN as exactly four digits, leading zeros kept", () => {
    expect(isPin("0420")).toBe(true);
    expect(isPin("420")).toBe(false);
    expect(isPin("12a4")).toBe(false);
  });

  it("asks for a name before a PIN person is added", () => {
    expect(pinNameProblem("  ")).toBe("Add their name.");
    expect(pinNameProblem("Lito")).toBeNull();
  });

  it("says a refused PIN form in words, never a code", () => {
    const words = pinFormProblem(new ApiError(400, { error: "invalid_shop_pin" }));
    expect(words).not.toContain("invalid_shop_pin");
    expect(words.length).toBeGreaterThan(0);
  });
});
