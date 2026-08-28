import { Tabs } from "expo-router";

import { GridgoTabBar } from "@/components/GridgoTabBar";
import { TABS } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The supplier tab shell.
 *
 * Five destinations, no raised action disc. The bar is drawn from the tokens
 * on every platform — see `GridgoTabBar`. Headers are off; each tab draws its own.
 *
 * A tab is a place the shop already is, not a step it takes, so the content
 * swaps under a bar that never moves. `none` is the library's current default;
 * it is stated here so an upgrade cannot quietly slide or cross-fade five
 * destinations a supplier switches between all day.
 */
export default function TabsLayout() {
  const colors = useThemeColors();

  return (
    <Tabs
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
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}
