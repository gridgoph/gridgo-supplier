import { Stack } from "expo-router";

import { stackScreenOptions } from "@/lib/navigationOptions";
import { useThemeName } from "@/hooks/useTheme";

/**
 * The shop's board: what clients see.
 *
 * Its own stack, like the accreditation catalogue, because everything under it
 * is setup rather than the daily floor — a shop comes here to put something up
 * or fix a price, not to work a job. That is also why the board is not a sixth
 * tab: the bar belongs to the work.
 *
 * Every screen keeps a title. Without one, iOS labels the back control with the
 * route group and a shop hears "(tabs)".
 */
export default function ShopLayout() {
  const scheme = useThemeName();

  return (
    <Stack screenOptions={stackScreenOptions(scheme)}>
      <Stack.Screen name="index" options={{ title: "Your board" }} />
      <Stack.Screen name="new" options={{ title: "Add a listing" }} />
      <Stack.Screen name="[id]/index" options={{ title: "Listing" }} />
      <Stack.Screen name="[id]/photos" options={{ title: "Sample photos" }} />
      <Stack.Screen name="[id]/preview" options={{ title: "What clients see" }} />
    </Stack>
  );
}
