import { Redirect } from "expo-router";

import { isSignedIn, useSession } from "@/store/session";

/** Launch: demo login or the supplier tab shell. Live session changes are handled by `Stack.Protected` in the root layout. */
export default function Index() {
  const user = useSession((s) => s.user);
  if (isSignedIn(user)) return <Redirect href="/(tabs)/home" />;
  return <Redirect href="/(auth)/login" />;
}
