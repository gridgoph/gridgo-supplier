import { Tabs } from "expo-router";

import { GridgoTabBar } from "@/components/GridgoTabBar";
import { TABS } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The supplier tab shell.
 *
 * Five destinations, no raised action disc. The bar is drawn from the tokens
 * on every platform — see `GridgoTabBar`. Headers are off; each tab draws its own.
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
