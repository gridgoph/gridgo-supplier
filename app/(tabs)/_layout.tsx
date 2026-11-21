import { Tabs } from "expo-router";

import { GridgoTabBar } from "@/components/GridgoTabBar";
import { SECTION_TABS, STAFF_TABS, TABS, type TabName } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { isShopOwner, useSession } from "@/store/session";

/** Every tab route: the four places, then the pages that sit inside them. */
const ROUTES: readonly TabName[] = [...TABS.map((tab) => tab.name), ...SECTION_TABS];

/**
 * The supplier tab shell.
 *
 * Four places, no raised action disc (`constants/tabs.ts`). The bar is drawn
 * from the tokens on every platform — see `GridgoTabBar`. Headers are off;
 * each tab draws its own.
 *
 * A tab is a place the shop already is, not a step it takes, so the content
 * swaps under a bar that never moves. `none` is the library's current default;
 * it is stated here so an upgrade cannot quietly slide or cross-fade places a
 * supplier switches between all day. `history` lets Android's back key leave
 * All jobs or Schedule for To do, the place that opened them.
 */
export default function TabsLayout() {
  const colors = useThemeColors();
  const owner = useSession((s) => isShopOwner(s.user));

  return (
    <Tabs
      initialRouteName="home"
      backBehavior="history"
      tabBar={(props) => <GridgoTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: "none",
        sceneStyle: { backgroundColor: colors.canvas },
        // A frozen tab whose photo tiles come down as a confirm sheet leaves
        // crashed the Android project. The wall stays live underneath a sheet.
        freezeOnBlur: false,
      }}
    >
      {ROUTES.filter((name) => STAFF_TABS.includes(name)).map((name) => (
        <Tabs.Screen key={name} name={name} options={{ title: titleOf(name) }} />
      ))}
      {/*
        A Staff member's tabs are the work, its conversations and their own
        account. The rest are guarded out, not just hidden, so a typed address
        cannot reach them.
      */}
      <Tabs.Protected guard={owner}>
        {ROUTES.filter((name) => !STAFF_TABS.includes(name)).map((name) => (
          <Tabs.Screen key={name} name={name} options={{ title: titleOf(name) }} />
        ))}
      </Tabs.Protected>
    </Tabs>
  );
}

function titleOf(name: TabName): string {
  return TABS.find((tab) => tab.name === name)?.label ?? PAGE_TITLES[name] ?? name;
}

const PAGE_TITLES: Partial<Record<TabName, string>> = {
  jobs: "All jobs",
  schedule: "Schedule",
  catalogues: "Products",
};
