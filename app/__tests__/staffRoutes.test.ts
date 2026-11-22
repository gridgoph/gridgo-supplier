import fs from "node:fs";
import path from "node:path";

/**
 * Staff never reach an Owner-only screen, by tap or by typed address
 * (gridgo-api#359). A route is reachable in Expo Router when it is declared
 * outside every `Protected` group or inside one whose guard is true — and a
 * route file nobody declares is reachable with no guard at all. So this reads
 * the layouts, evaluates every guard for a session, and lists what is open.
 */
const ROOT = path.resolve(__dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

type Flags = Record<string, boolean>;

/** Screen name → guard expressions it sits under, outermost first. */
function guardedScreens(source: string, tag: "Stack" | "Tabs"): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const stack: string[] = [];
  const token = new RegExp(`<${tag}\\.Protected guard=\\{([^}]*)\\}>|</${tag}\\.Protected>|<${tag}\\.Screen[\\s\\S]*?name=(?:"([^"]+)"|\\{tab\\.name\\})`, "g");
  for (const match of source.matchAll(token)) {
    if (match[0].startsWith(`<${tag}.Protected`)) stack.push(match[1]);
    else if (match[0].startsWith(`</${tag}.Protected`)) stack.pop();
    else out.set(match[2] ?? "{tab.name}", [...stack]);
  }
  return out;
}

function open(guards: string[], flags: Flags): boolean {
  return guards.every((expression) => {
    const names = Object.keys(flags);
    return Boolean(new Function(...names, `return (${expression});`)(...names.map((n) => flags[n])));
  });
}

/** Every route the root stack can be asked for, from the files on disk. */
function rootRoutes(): string[] {
  const routes: string[] = [];
  const app = path.join(ROOT, "app");
  for (const entry of fs.readdirSync(app, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "_layout.tsx" || entry.name === "+html.tsx") continue;
    if (entry.isFile() && entry.name.endsWith(".tsx")) {
      routes.push(entry.name.replace(/\.tsx$/, ""));
    } else if (entry.isDirectory()) {
      const dir = path.join(app, entry.name);
      if (fs.existsSync(path.join(dir, "_layout.tsx")) && entry.name !== "(auth)") {
        routes.push(entry.name);
        continue;
      }
      for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
        if (child.isFile() && child.name.endsWith(".tsx") && child.name !== "_layout.tsx") {
          routes.push(`${entry.name}/${child.name.replace(/\.tsx$/, "")}`);
        } else if (child.isDirectory() && child.name !== "__tests__") {
          routes.push(`${entry.name}/${child.name}`);
        }
      }
    }
  }
  return routes.filter((r) => r !== "job" && !r.startsWith("job/")).concat("job/[id]");
}

const STAFF: Flags = {
  signedIn: true,
  signedOut: false,
  accessBlocked: false,
  legalBlocked: false,
  floorOpen: true,
  matchable: true,
  teamPending: false,
  deviceLocked: false,
  owner: false,
  runsShop: false,
};
const MANAGER: Flags = { ...STAFF, runsShop: true };
const OWNER: Flags = { ...STAFF, owner: true, runsShop: true };
/** The shared shop phone between turns: Clerk signed in, nobody picked. */
const LOCKED: Flags = { ...STAFF, signedIn: false, floorOpen: false, matchable: false, deviceLocked: true };

const root = guardedScreens(read("app/_layout.tsx"), "Stack");

function reachable(flags: Flags): string[] {
  return [...root.entries()].filter(([, guards]) => open(guards, flags)).map(([name]) => name).sort();
}

describe("Staff reach only the work", () => {
  it("declares every root route, so none is reachable without a guard", () => {
    const undeclared = rootRoutes().filter((route) => !root.has(route));
    expect(undeclared).toEqual([]);
  });

  it("opens exactly the order floor to a signed-in Staff member", () => {
    const staffOnly = reachable(STAFF).filter(
      (name) => !reachable({ ...STAFF, signedIn: false, floorOpen: false, matchable: false }).includes(name),
    );
    expect(staffOnly).toEqual(
      [
        "(tabs)",
        "alerts",
        "confirm",
        "job/[id]",
        "pick",
        "pick-date",
        "push-prompt",
        "settings",
        "shop-status",
        "team",
        "team-person",
        "whats-new",
      ].sort(),
    );
  });

  it.each([
    "team-invite",
    "team-pin",
    "payout",
    "payout-account",
    "shop-hours",
    "shop-closure",
    "shop-details",
    "shop-location",
    "shop",
    "services",
    "capacity",
    "performance",
    "reviews",
    "late-production",
    "chat/index",
    "report",
    "call",
    "delete-account",
  ])("keeps %s closed to Staff and open to the Owner", (name) => {
    expect(root.has(name)).toBe(true);
    expect(reachable(STAFF)).not.toContain(name);
    expect(reachable(OWNER)).toContain(name);
  });

  it.each(["team-invite", "team-pin", "shop-hours", "shop-closure", "shop", "product-actions"])(
    "opens %s to a Manager, who runs the team, hours and products",
    (name) => {
      expect(reachable(MANAGER)).toContain(name);
    },
  );

  it.each([
    "payout",
    "payout-account",
    "shop-details",
    "shop-location",
    "services",
    "chat/index",
    "report",
    "delete-account",
    "performance",
    "late-production",
  ])("keeps %s, the Owner's money and settings, closed to a Manager", (name) => {
    expect(reachable(MANAGER)).not.toContain(name);
  });

  it("opens only the picker on a locked shop phone, never the login's own screens", () => {
    const locked = reachable(LOCKED);
    expect(locked).toContain("who-is-working");
    for (const name of ["(tabs)", "team", "payout", "settings", "alerts", "job/[id]"]) {
      expect(locked).not.toContain(name);
    }
    expect(reachable(OWNER)).not.toContain("who-is-working");
  });

  it("opens the waiting screen only while the Owner has not answered", () => {
    const pending: Flags = { ...STAFF, signedIn: false, floorOpen: false, matchable: false, teamPending: true };
    expect(reachable(pending)).toContain("team-waiting");
    expect(reachable(pending)).not.toContain("(tabs)");
    expect(reachable(STAFF)).not.toContain("team-waiting");
  });

  it("guards the Owner's tabs: Staff see To do, Messages, All jobs and My shop, never Money", () => {
    const source = read("app/(tabs)/_layout.tsx");
    expect(source).toMatch(/<Tabs\.Protected guard=\{owner\}>[\s\S]*!MANAGER_TABS\.includes[\s\S]*<\/Tabs\.Protected>/);
    expect(source).toMatch(/<Tabs\.Protected guard=\{runsShop\}>[\s\S]*MANAGER_TABS\.includes[\s\S]*<\/Tabs\.Protected>/);
    const { MANAGER_TABS, STAFF_TABS, TABS } = jest.requireActual("@/constants/tabs") as typeof import("@/constants/tabs");
    // A Manager adds the hours (Schedule) and the products, never Money.
    expect([...MANAGER_TABS].sort()).toEqual(["account", "catalogues", "home", "jobs", "messages", "schedule"]);
    expect([...STAFF_TABS].sort()).toEqual(["account", "home", "jobs", "messages"]);
    expect(STAFF_TABS).not.toContain("money");
    expect(STAFF_TABS).not.toContain("schedule");
    expect(STAFF_TABS).not.toContain("catalogues");
    expect(TABS.map((t) => t.name)).toEqual(["home", "messages", "money", "account"]);
  });

  it("guards the Owner's steps on a job: cancel, renegotiate and payout evidence", () => {
    const job = guardedScreens(read("app/job/[id]/_layout.tsx"), "Stack");
    for (const name of ["cancel", "reschedule", "change", "colour", "fulfilment"]) {
      expect(open(job.get(name) ?? [], { owner: false })).toBe(false);
      expect(open(job.get(name) ?? [], { owner: true })).toBe(true);
    }
    for (const name of ["index", "accept", "decline", "advance", "self-qc", "handoff", "messages", "client-messages", "progress-photo", "finished", "print", "counter-code"]) {
      expect(open(job.get(name) ?? [], { owner: false })).toBe(true);
    }
  });
});
