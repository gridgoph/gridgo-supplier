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
  owner: false,
};
const OWNER: Flags = { ...STAFF, owner: true };

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
      ["(tabs)", "alerts", "confirm", "job/[id]", "pick", "pick-date", "push-prompt", "settings", "whats-new"].sort(),
    );
  });

  it.each([
    "team",
    "team-invite",
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

  it("opens the waiting screen only while the Owner has not answered", () => {
    const pending: Flags = { ...STAFF, signedIn: false, floorOpen: false, matchable: false, teamPending: true };
    expect(reachable(pending)).toContain("team-waiting");
    expect(reachable(pending)).not.toContain("(tabs)");
    expect(reachable(STAFF)).not.toContain("team-waiting");
  });

  it("guards the Owner's tabs: Staff see Jobs and Account", () => {
    const source = read("app/(tabs)/_layout.tsx");
    expect(source).toMatch(/<Tabs\.Protected guard=\{owner\}>[\s\S]*!STAFF_TABS\.includes[\s\S]*<\/Tabs\.Protected>/);
    const { STAFF_TABS, TABS } = jest.requireActual("@/constants/tabs") as typeof import("@/constants/tabs");
    expect([...STAFF_TABS].sort()).toEqual(["account", "jobs"]);
    expect(TABS.map((t) => t.name)).toEqual(["home", "jobs", "schedule", "catalogues", "account"]);
  });

  it("guards the Owner's steps on a job: cancel, renegotiate and payout evidence", () => {
    const job = guardedScreens(read("app/job/[id]/_layout.tsx"), "Stack");
    for (const name of ["cancel", "reschedule", "change", "colour", "fulfilment"]) {
      expect(open(job.get(name) ?? [], { owner: false })).toBe(false);
      expect(open(job.get(name) ?? [], { owner: true })).toBe(true);
    }
    for (const name of ["index", "accept", "decline", "advance", "self-qc", "handoff", "messages", "client-messages", "progress-photo", "finished"]) {
      expect(open(job.get(name) ?? [], { owner: false })).toBe(true);
    }
  });
});
