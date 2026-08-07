/**
 * The supplier tab bar — five honest destinations.
 * No floating action disc; every tab is a place, not an action.
 */

export type TabName = "home" | "jobs" | "schedule" | "notifications" | "account";

export type TabDefinition = {
  name: TabName;
  label: string;
};

export const TABS: readonly TabDefinition[] = [
  { name: "home", label: "Home" },
  { name: "jobs", label: "Jobs" },
  { name: "schedule", label: "Schedule" },
  { name: "notifications", label: "Alerts" },
  { name: "account", label: "Account" },
];
