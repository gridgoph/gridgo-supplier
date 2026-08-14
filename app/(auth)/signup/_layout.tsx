import { Redirect } from "expo-router";

/** Keep retired self-signup deep links inside the invitation-only path. */
export default function SignupLayout() {
  return <Redirect href="/(auth)/accept-invitation" />;
}
