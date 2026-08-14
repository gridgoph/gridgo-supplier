import { Redirect } from "expo-router";

export default function SupplierSignupRedirect() {
  return <Redirect href="/(auth)/accept-invitation" />;
}
