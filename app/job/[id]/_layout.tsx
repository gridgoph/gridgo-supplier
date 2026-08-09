import { Stack } from "expo-router";

import { stackScreenOptions } from "@/lib/navigationOptions";
import { useThemeName } from "@/hooks/useTheme";

/**
 * The job workspace and the flow screens it opens.
 *
 * Every state-changing step is its own screen with one clear action, so nothing
 * that commits the shop to work can happen from a row tap.
 */
export default function JobLayout() {
  const scheme = useThemeName();

  return (
    <Stack screenOptions={stackScreenOptions(scheme)}>
      <Stack.Screen name="index" options={{ title: "Job" }} />
      <Stack.Screen name="accept" options={{ title: "Accept job" }} />
      <Stack.Screen name="decline" options={{ title: "Decline job" }} />
      <Stack.Screen name="proof" options={{ title: "Proof" }} />
      <Stack.Screen name="advance" options={{ title: "Production update" }} />
      <Stack.Screen name="self-qc" options={{ title: "Self-QC" }} />
      <Stack.Screen name="handoff" options={{ title: "Pickup handoff" }} />
    </Stack>
  );
}
