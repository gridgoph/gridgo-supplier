import { Stack } from "expo-router";

import { radius } from "@/constants/theme";
import { stackScreenOptions } from "@/lib/navigationOptions";
import { useThemeName } from "@/hooks/useTheme";

/**
 * The job workspace and the flow screens it opens.
 *
 * Every state-changing step is its own screen with one clear action, so nothing
 * that commits the shop to work can happen from a row tap.
 *
 * Accept, decline, proof of fulfilment, self-QC and handoff are pushed as full
 * screens: each is a commitment with fields to fill and consequences to read,
 * and a sheet would crop them and invite a half-filled form to be swiped away.
 * A production update is the opposite — one short, reversible step over a job
 * the shop is already looking at — so it is presented as a sheet, sized to its
 * own content, with the job still visible behind it.
 */
export default function JobLayout() {
  const scheme = useThemeName();

  return (
    <Stack screenOptions={stackScreenOptions(scheme)}>
      <Stack.Screen name="index" options={{ title: "Job" }} />
      <Stack.Screen name="accept" options={{ title: "Accept job" }} />
      <Stack.Screen name="decline" options={{ title: "Decline job" }} />
      <Stack.Screen name="fulfilment" options={{ title: "Proof of fulfilment" }} />
      <Stack.Screen
        name="advance"
        options={{
          title: "Production update",
          presentation: "formSheet",
          // Two stops: enough for the choice and the note, and all the way up
          // once the keyboard is in the way.
          sheetAllowedDetents: [0.6, 1],
          sheetGrabberVisible: true,
          sheetCornerRadius: radius.card,
          sheetElevation: 24,
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <Stack.Screen name="self-qc" options={{ title: "Self-QC" }} />
      <Stack.Screen name="handoff" options={{ title: "Pickup handoff" }} />
    </Stack>
  );
}
