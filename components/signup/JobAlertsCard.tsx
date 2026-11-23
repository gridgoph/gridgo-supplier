import { useState } from "react";
import { Text, View } from "react-native";

import { PushEnableCard } from "@/components/PushEnableCard";
import { SwitchRow } from "@/components/controls/SwitchRow";
import { useShopTeam, useTeamViewer } from "@/hooks/useShopTeam";
import * as api from "@/lib/api";

/**
 * Job alerts, on the payout step of guided sign-up (gridgo-supplier#265).
 *
 * Two different things, both needed: the switch is GRIDGO's record of
 * whether this person is alerted to new jobs (the team's own member
 * preference), and the card beneath is this phone's permission to show them.
 * Nothing new is built: both are the team and push pieces the app already has.
 */
export function JobAlertsCard() {
  const { team } = useShopTeam();
  const { selfKey } = useTeamViewer();
  const saved = team?.people.find((person) => person.key === selfKey)?.jobAlerts;
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    setOn(next);
    setError(null);
    try {
      await api.updateTeamSelf({ jobAlerts: next });
    } catch {
      setOn(null);
      setError("GRIDGO did not save that. Try again.");
    }
  }

  return (
    <View className="gap-3" testID="job-alerts">
      <Text className="text-h2 text-text-primary">Job alerts</Text>
      <SwitchRow
        value={on ?? saved ?? true}
        onChange={(next) => void change(next)}
        label="Alert me about new jobs"
        hint="Pahibalo-a ko · You have an hour to accept each one."
      />
      {error ? <Text className="text-caption text-error">{error}</Text> : null}
      <PushEnableCard spacing="above" />
    </View>
  );
}
