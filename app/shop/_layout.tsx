import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";

import { nestedStackScreenOptions, sheetScreenOptions } from "@/lib/navigationOptions";
import { useThemeName } from "@/hooks/useTheme";

/**
 * Everything that opens on top of Catalogues.
 *
 * The board itself is a tab. This stack is what a shop pushes from it — adding
 * a listing, one listing's own editor with its samples and its client's-eye
 * view, and asking Operations for a product type GRIDGO does not list. They are their own stack rather than tab content because each is a
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
    <Stack screenOptions={nestedStackScreenOptions(scheme, top)}>
      <Stack.Screen name="add" options={{ title: "Add a product" }} />
      <Stack.Screen name="product/[id]" options={{ title: "Product" }} />
      <Stack.Screen name="ask-template" options={{ title: "Ask GRIDGO" }} />
      <Stack.Screen name="setup-help" options={{ title: "Let GRIDGO set it up" }} />
      <Stack.Screen name="check-products" options={{ title: "Check your products" }} />
      <Stack.Screen name="new" options={{ title: "Custom product" }} />
      <Stack.Screen name="[id]/index" options={{ title: "Product" }} />
      <Stack.Screen name="[id]/photos" options={{ title: "Photos" }} />
      <Stack.Screen name="[id]/preview" options={{ title: "What clients see" }} />
      <Stack.Screen name="request-type" options={{ title: "Request a product type" }} />
      {/*
        The listing editor is this stack, not the root. A root formSheet has
        no card here to present over, so Remove this listing opened nothing
        on the phone. This is the same sheet, presented on the listing.
      */}
      <Stack.Screen name="confirm" options={sheetScreenOptions(scheme)} />
      <Stack.Screen name="photo-policy" options={sheetScreenOptions(scheme)} />
    </Stack>
  );
}
