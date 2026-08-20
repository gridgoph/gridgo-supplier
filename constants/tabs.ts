/**
 * The supplier tab bar — five honest destinations.
 * No floating action disc; every tab is a place, not an action.
 *
 * Alerts are not one of them. An inbox is something a shop glances at while it
 * works, not a room it walks into, so it lives on a bell in every masthead and
 * the bar is spent on the five places a shop actually stands: the floor, the
 * work, the week, its own catalogue, and its account.
 */

export type TabName = "home" | "jobs" | "schedule" | "catalogues" | "account";

export type TabDefinition = {
  name: TabName;
  label: string;
};

export const TABS: readonly TabDefinition[] = [
  { name: "home", label: "Home" },
  { name: "jobs", label: "Jobs" },
  { name: "schedule", label: "Schedule" },
  { name: "catalogues", label: "Catalogues" },
  { name: "account", label: "Account" },
];
