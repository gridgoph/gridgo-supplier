import { Tabs } from "expo-router";

import { GridgoTabBar } from "@/components/GridgoTabBar";
import { TABS } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The client tab shell.
 *
 * The bar is drawn from the tokens on every platform — see `GridgoTabBar`.
 * Headers are off here because the tabs do not share one: Home carries a role
 * header, New Request carries the stepper.
 */
export default function TabsLayout() {
  const colors = useThemeColors();

  return (
    <Tabs
      tabBar={(props) => <GridgoTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}
