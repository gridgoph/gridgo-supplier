/**
 * The supplier tab bar.
 * Same shape as the client app so GridgoTabBar stays shared.
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

/** No floating action disc — job accept/decline is on the Jobs screen. */
export const ACTION_TAB = "schedule" as TabName;
