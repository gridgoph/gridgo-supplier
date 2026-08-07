import { Redirect } from "expo-router";

import { useSession } from "@/store/session";

/** Launch: demo login or the supplier tab shell. */
export default function Index() {
  const user = useSession((s) => s.user);
  if (user) return <Redirect href="/(tabs)/home" />;
  return <Redirect href="/(auth)/login" />;
}
