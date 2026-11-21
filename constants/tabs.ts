/**
 * The supplier tab bar: four places, the same four on phone and web
 * (gridgo-supplier#269, gridgo-web#327).
 *
 * To do is the floor: today's work with Express on top, and the doors to every
 * job and the week. Messages is every conversation. Money is the Owner's.
 * My shop is the shop itself: products, hours, team and account.
 *
 * Alerts are not one of them. An inbox is something a shop glances at while it
 * works, so it lives on a bell in every masthead.
 *
 * Jobs, Schedule and Catalogues are still tab routes, so every address that
 * opens them still works, but they are not drawn in the bar: each belongs to
 * one of the four places (`TAB_SECTION`), and the bar lights that place while
 * one of them is open.
 */

export type TabName = "home" | "messages" | "money" | "account" | "jobs" | "schedule" | "catalogues";

export type BarTabName = "home" | "messages" | "money" | "account";

export type TabDefinition = {
  name: BarTabName;
  label: string;
};

/** The bar, in order. */
export const TABS: readonly TabDefinition[] = [
  { name: "home", label: "To do" },
  { name: "messages", label: "Messages" },
  { name: "money", label: "Money" },
  { name: "account", label: "My shop" },
];

/** Tab routes that are pages inside one of the four places, not places of their own. */
export const SECTION_TABS: readonly TabName[] = ["jobs", "schedule", "catalogues"];

/** Which place in the bar a page belongs to. */
export const TAB_SECTION: Record<TabName, BarTabName> = {
  home: "home",
  messages: "messages",
  money: "money",
  account: "account",
  jobs: "home",
  schedule: "home",
  catalogues: "account",
};

/**
 * What a shop's Staff member reaches: the work, its conversations and their own
 * account. Money (earnings), Schedule (the shop's hours) and Catalogues (prices
 * and products) are the Owner's — GRIDGO refuses their routes to Staff.
 */
export const STAFF_TABS: readonly TabName[] = ["home", "messages", "account", "jobs"];

/**
 * A Manager's tabs: Staff's, plus Schedule and Catalogues — the shop's hours
 * and products are theirs to change. Money stays the Owner's
 * (gridgo-api `docs/SHOP_TEAM_API.md`, report F315793B).
 */
export const MANAGER_TABS: readonly TabName[] = [...STAFF_TABS, "schedule", "catalogues"];
