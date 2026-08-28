import fs from "node:fs";
import path from "node:path";

import { TABS } from "@/constants/tabs";

const ROOT = path.resolve(__dirname, "../..");

function source(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

const TAB_SCREENS = [
  "app/(tabs)/home.tsx",
  "app/(tabs)/jobs.tsx",
  "app/(tabs)/schedule.tsx",
  "app/(tabs)/catalogues.tsx",
  "app/(tabs)/account.tsx",
];

/**
 * The masthead element itself, from its opening tag to the line that closes it.
 *
 * Scoped deliberately: `SectionHeader` on the alerts screen has a `right` slot
 * of its own for "Mark all read", and that is an in-page control rather than
 * anything in the corner of a header.
 */
function masthead(file: string): string {
  const lines = source(file).split("\n");
  const opens = lines.findIndex((line) => line.includes("<ScreenHeader"));
  if (opens < 0) return "";
  if (lines[opens].includes("/>")) return lines[opens];

  const closes = lines.findIndex((line, at) => at > opens && line.trim() === "/>");
  return lines.slice(opens, closes + 1).join("\n");
}

/**
 * Where alerts live, and where the shop's catalogue lives.
 *
 * Two corrections are pinned here, because both were got wrong on the way to
 * this layout. A pill counting today's jobs sat in Home's corner and read as an
 * inbox; replacing it with a picture of the board fixed the wrong half, moving
 * the shortcut into the corner and leaving the inbox in the bar. The captain
 * wants the opposite, and it is the ordinary shape: an inbox is a bell you
 * glance at while you work, and the bar is for places you stand.
 */
describe("the five places and the one inbox", () => {
  it("gives the bar to five places, and Catalogues is one of them", () => {
    expect(TABS.map((tab) => tab.name)).toEqual([
      "home",
      "jobs",
      "schedule",
      "catalogues",
      "account",
    ]);
    expect(TABS.find((tab) => tab.name === "catalogues")?.label).toBe("Catalogues");
  });

  /** The tab is the board. Nothing else in the app is called Catalogues. */
  it("mounts the shop's own board on the Catalogues tab", () => {
    const board = source("app/(tabs)/catalogues.tsx");

    expect(board).toContain("useBoard");
    expect(board).toContain("<ListingCard");
    expect(fs.existsSync(path.join(ROOT, "app/shop/index.tsx"))).toBe(false);
  });

  it("keeps alerts off the bar and on the root stack", () => {
    expect(fs.existsSync(path.join(ROOT, "app/(tabs)/notifications.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "app/alerts.tsx"))).toBe(true);
    expect(source("app/_layout.tsx")).toContain('name="alerts"');
  });

  /**
   * Alerts are one tap from wherever the shop is standing, which is the whole
   * argument for taking them out of the bar.
   */
  /**
   * The title already names the place. A second line under Jobs, Schedule or
   * Catalogues was a restatement the captain asked off the masthead.
   */
  it("does not restate Jobs, Schedule or Catalogues under the title", () => {
    for (const file of [
      "app/(tabs)/jobs.tsx",
      "app/(tabs)/schedule.tsx",
      "app/(tabs)/catalogues.tsx",
    ]) {
      expect({ file, subtitle: masthead(file).includes("subtitle=") }).toEqual({
        file,
        subtitle: false,
      });
    }
  });

  it("puts the bell in every tab's masthead", () => {
    for (const file of TAB_SCREENS) {
      expect({ file, bell: masthead(file).includes("<AlertsBell") }).toEqual({
        file,
        bell: true,
      });
    }
  });

  /** Not on the screen it opens — the shop is already standing in it. */
  it("draws no bell on the alerts screen itself", () => {
    expect(source("app/alerts.tsx")).not.toContain("AlertsBell");
  });

  /** The unread mark belongs to the bell now, and to nothing else. */
  it("counts unread on the bell alone", () => {
    expect(source("components/AlertsBell.tsx")).toContain("unreadCount");
    expect(source("components/GridgoTabBar.tsx")).not.toContain("unreadCount");
    for (const file of TAB_SCREENS) {
      expect({ file, counts: source(file).includes("unreadCount") }).toEqual({
        file,
        counts: false,
      });
    }
  });

  /**
   * The tab bar's fourth glyph is a crop mark — the register mark a printer
   * trims to, and the frame every listing photo in this app already wears. Not
   * a bell, and not the grid of rounded squares every other product uses.
   */
  it("gives Catalogues a print mark rather than a bell", () => {
    const bar = source("components/GridgoTabBar.tsx");

    expect(bar).toContain("catalogues: Frame");
    expect(bar).not.toContain("Bell");
    expect(bar).not.toContain("LayoutGrid");
  });

  /**
   * A pill counting today's jobs is what started all of this. Due and late are
   * said on Home's own obligations and again on Schedule.
   */
  it("leaves counting jobs to the screens built for it", () => {
    const home = source("app/(tabs)/home.tsx");

    expect(home).not.toContain("buildSchedule");
    expect(home).not.toContain("Nothing due today");
  });

  /** Anything that used to open the Alerts tab has to open the screen. */
  it("sends every route that opened the Alerts tab to the alerts screen", () => {
    for (const file of ["lib/push.ts", "components/ToastHost.tsx"]) {
      expect({ file, stale: source(file).includes("(tabs)/notifications") }).toEqual({
        file,
        stale: false,
      });
      expect({ file, opens: source(file).includes('"/alerts"') }).toEqual({ file, opens: true });
    }
  });
});
