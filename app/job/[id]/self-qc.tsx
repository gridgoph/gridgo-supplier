import { Redirect, useLocalSearchParams } from "expo-router";

/** Keep existing deep links usable after retiring the supplier self-check. */
export default function LegacySelfQcRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: "/job/[id]/handoff", params: { id } }} />;
}
