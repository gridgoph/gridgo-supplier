import { Stack } from "expo-router";

/**
 * Opening a shop account, one step per route.
 *
 * Routes rather than a single screen with a counter, so the platform's own back
 * gesture takes a shop back a step and the draft — persisted in
 * `store/signupDraft` — is what carries the typing between them.
 *
 * Every step draws its own header: the progress line and the way back are the
 * same object here (`components/OnboardingStep`), and a native header above it
 * would say the step's name twice and steal the map step's height.
 */
export default function SignupLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="index" options={{ headerShown: false, title: "Your shop" }} />
      <Stack.Screen name="location" options={{ headerShown: false, title: "Where you print" }} />
      <Stack.Screen name="services" options={{ headerShown: false, title: "What you print" }} />
      <Stack.Screen name="documents" options={{ headerShown: false, title: "Your papers" }} />
      <Stack.Screen name="review" options={{ headerShown: false, title: "Check and send" }} />
    </Stack>
  );
}
