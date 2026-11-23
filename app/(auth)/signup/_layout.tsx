import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderBackButton } from "expo-router/react-navigation";
import { Stack, router } from "expo-router";

import { useThemeName } from "@/hooks/useTheme";
import { stackScreenOptions } from "@/lib/navigationOptions";

/**
 * Opening a shop account, one step per route.
 *
 * Routes rather than a single screen with a counter, so the platform's own back
 * gesture takes a shop back a step and the draft — persisted in
 * `store/signupDraft` — is what carries the typing between them.
 *
 * The stack header is the way back. A drawn chevron here would be a second
 * control doing the same job, and a custom round one is exactly what this
 * flow must not grow.
 *
 * The first step has no previous sibling in this stack, so it borrows the
 * platform back control and pops the parent (welcome). Later steps use the
 * stack's own history.
 */
export default function SignupLayout() {
  const scheme = useThemeName();
  const { top } = useSafeAreaInsets();

  return (
    <Stack screenOptions={stackScreenOptions(scheme, top)}>
      {/*
        Guided sign-up (gridgo-supplier#265): step 0, the sign-in, then the
        missions. `start` is the door, so it borrows the platform back control
        the way the older first step does.
      */}
      <Stack.Screen
        name="start"
        options={{
          title: "Before you start",
          headerLeft: (props) => (
            <HeaderBackButton
              tintColor={props.tintColor}
              displayMode="minimal"
              onPress={() => router.back()}
            />
          ),
        }}
      />
      <Stack.Screen name="account" options={{ title: "Your sign-in" }} />
      <Stack.Screen name="missions" options={{ title: "Set up your shop" }} />
      <Stack.Screen name="your-shop" options={{ title: "Your shop" }} />
      <Stack.Screen name="pin" options={{ title: "Pin your shop" }} />
      <Stack.Screen name="prints" options={{ title: "What you print" }} />
      <Stack.Screen name="open-shop" options={{ title: "Who takes jobs" }} />
      <Stack.Screen
        name="index"
        options={{
          title: "Your shop",
          headerLeft: (props) => (
            <HeaderBackButton
              tintColor={props.tintColor}
              displayMode="minimal"
              onPress={() => router.back()}
            />
          ),
        }}
      />
      <Stack.Screen name="location" options={{ title: "Where you print" }} />
      <Stack.Screen name="services" options={{ title: "What you print" }} />
      <Stack.Screen name="team" options={{ title: "Your team" }} />
      <Stack.Screen name="review" options={{ title: "Check and send" }} />
    </Stack>
  );
}
