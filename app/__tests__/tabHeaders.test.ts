import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function source(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

const TABS = [
  "app/(tabs)/home.tsx",
  "app/(tabs)/jobs.tsx",
  "app/(tabs)/schedule.tsx",
  "app/(tabs)/notifications.tsx",
  "app/(tabs)/account.tsx",
];

/**
 * The masthead element itself, from its opening tag to the line that closes it.
 *
 * Scoped deliberately: `SectionHeader` on the Alerts screen has a `right` slot
 * of its own for "Mark all read", and that is an in-page control rather than
 * anything in the corner of a header. A looser search would have called it a
 * masthead badge and failed for the wrong reason.
 */
function masthead(file: string): string {
  const lines = source(file).split("\n");
  const opens = lines.findIndex((line) => line.includes("<ScreenHeader"));
  if (opens < 0) return "";
  if (lines[opens].includes("/>")) return lines[opens];

  const closes = lines.findIndex((line, at) => at > opens && line.trim() === "/>");
  return lines.slice(opens, closes + 1).join("\n");
}

/** The masthead's `right` slot, and whatever is put in it. */
const RIGHT_SLOT = /\bright=\{/;

/**
 * The captain's screenshot: a chip in the top right of Home counting today's
 * jobs, with an arrow drawn from it down to the Alerts tab. A small pill in
 * that corner is a notification bell everywhere else on a phone, and this app
 * already has one place where alerts are announced — the Alerts tab, and the
 * badge on it.
 *
 * So the rule is enumerated rather than remembered, because "put the count back
 * in the header, it is only one tab" is exactly the change that would undo it:
 * one masthead in this app has a right-hand control, it is Home's, and it is a
 * door to the board rather than a count of anything.
 */
describe("what sits in the corner of a tab's masthead", () => {
  it("gives the slot to Home alone", () => {
    const users = TABS.filter((file) => RIGHT_SLOT.test(masthead(file)));

    expect(users).toEqual(["app/(tabs)/home.tsx"]);
  });

  it("puts the shop's board there, not a status chip", () => {
    const home = masthead("app/(tabs)/home.tsx");

    expect(home).toContain("<BoardShortcut");
    expect(home).not.toContain("StatusChip");
  });

  /**
   * Not a bell, not a badge, not a count. Home used to build its chip from
   * today's schedule summary; nothing on this screen reads that any more, and
   * what is due or late is said on the obligations below it and on Schedule.
   */
  it("leaves counting to the screens built for it", () => {
    const home = source("app/(tabs)/home.tsx");

    expect(home).not.toContain("buildSchedule");
    expect(home).not.toContain("Nothing due today");
  });

  /**
   * Unread is the tab bar's, and only the tab bar's. A second announcement in a
   * masthead is how a shop learns that neither of them means anything.
   */
  it("announces unread nowhere but the tab bar", () => {
    for (const file of TABS) {
      expect({ file, reads: source(file).includes("unreadCount") }).toEqual({
        file,
        reads: false,
      });
    }
    expect(source("components/GridgoTabBar.tsx")).toContain("unreadCount");
  });

  /** Five tabs. A sixth for the board would be a room, not a shortcut. */
  it("keeps the board a shortcut rather than a sixth tab", () => {
    const tabs = source("constants/tabs.ts");
    expect(tabs).not.toContain("shop");
    // The entries themselves, not the `name:` on the type above them.
    expect(tabs.match(/\{ name: "/g)).toHaveLength(5);
  });
});
