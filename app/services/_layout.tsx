import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";

import { stackScreenOptions } from "@/lib/navigationOptions";
import { useThemeName } from "@/hooks/useTheme";

/**
 * The shop's catalogue: every category, then the services inside one.
 *
 * Two pushed screens rather than one long list — a shop refines a category it
 * has chosen to open, instead of scrolling past three it will never offer.
 */
export default function ServicesLayout() {
  const scheme = useThemeName();
  const { top } = useSafeAreaInsets();

  return (
    <Stack screenOptions={stackScreenOptions(scheme, top)}>
      <Stack.Screen name="index" options={{ title: "Services" }} />
      <Stack.Screen name="[category]" options={{ title: "Category" }} />
    </Stack>
  );
}
