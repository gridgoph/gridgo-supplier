import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";

import { stackScreenOptions } from "@/lib/navigationOptions";
import { useThemeName } from "@/hooks/useTheme";

/**
 * Everything that opens on top of Catalogues.
 *
 * The board itself is a tab. This stack is what a shop pushes from it — adding
 * a listing, and one listing's own editor with its samples and its client's-eye
 * view. They are their own stack rather than tab content because each is a
 * commitment a shop backs out of, and the platform's own back chevron is how
 * that is done.
 *
 * Every screen keeps a title. Without one, iOS labels the back control with the
 * route group and a shop hears "(tabs)".
 */
export default function ShopLayout() {
  const scheme = useThemeName();
  const { top } = useSafeAreaInsets();

  return (
    <Stack screenOptions={stackScreenOptions(scheme, top)}>
      <Stack.Screen name="new" options={{ title: "Add a listing" }} />
      <Stack.Screen name="[id]/index" options={{ title: "Listing" }} />
      <Stack.Screen name="[id]/photos" options={{ title: "Sample photos" }} />
      <Stack.Screen name="[id]/preview" options={{ title: "What clients see" }} />
    </Stack>
  );
}
