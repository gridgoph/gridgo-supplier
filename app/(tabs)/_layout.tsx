import { router, Tabs, type Href } from "expo-router";
import { useEffect } from "react";

import { GridgoTabBar } from "@/components/GridgoTabBar";
import { MANAGER_TABS, SECTION_TABS, STAFF_TABS, TABS, type TabName } from "@/constants/tabs";
import { WorkerBar } from "@/components/team/WorkerBar";
import { useThemeColors } from "@/hooks/useTheme";
import { canRunShop, isShopOwner, useSession } from "@/store/session";
import { useTeamSetup } from "@/store/teamSetup";

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
  const runsShop = useSession((s) => canRunShop(s.user));
  // "Me and staff" at sign-up: the Team screen opens once, over the new floor.
  const openTeam = useTeamSetup((s) => s.openTeam);
  useEffect(() => {
    if (owner && openTeam && useTeamSetup.getState().consume()) router.push("/team" as Href);
  }, [owner, openTeam]);

  return (
    <Tabs
      initialRouteName="home"
      backBehavior="history"
      tabBar={(props) => (
        <>
          {/* Who the shared shop phone is acting as, on every place. */}
          <WorkerBar />
          <GridgoTabBar {...props} />
        </>
      )}
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
      {/* A Manager also changes the shop's hours and products. */}
      <Tabs.Protected guard={runsShop}>
        {ROUTES.filter((name) => !STAFF_TABS.includes(name) && MANAGER_TABS.includes(name)).map((name) => (
          <Tabs.Screen key={name} name={name} options={{ title: titleOf(name) }} />
        ))}
      </Tabs.Protected>
      <Tabs.Protected guard={owner}>
        {ROUTES.filter((name) => !STAFF_TABS.includes(name) && !MANAGER_TABS.includes(name)).map((name) => (
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
