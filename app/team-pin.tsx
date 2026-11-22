import { router, useLocalSearchParams } from "expo-router";
import { Lock } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { DigitBoxes } from "@/components/DigitBoxes";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { TextField } from "@/components/controls/TextField";
import { TeamPhotoPicker } from "@/components/team/TeamPhotoPicker";
import { useTeamViewer } from "@/hooks/useShopTeam";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { isPin, pinFormProblem, pinNameProblem } from "@/lib/teamRoster";

const ROLE_OPTIONS = [
  { value: "staff", label: "Staff" },
  { value: "manager", label: "Manager" },
] as const;

/**
 * Add someone with no phone or GRIDGO account (report F315793B): a name, an
 * optional photo and four digits. They pick themselves on the shop's phone
 * and every job they touch carries their name. With `reset`, the same screen
 * gives an existing person a new PIN — whoever was working under the old one
 * is sent back to the picker.
 *
 * The PIN is typed twice nowhere and shown nowhere after this: GRIDGO keeps
 * only a hash, so the owner says it to the person now.
 */
export default function TeamPinScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ reset?: string; name?: string }>();
  const resetId = typeof params.reset === "string" && params.reset ? params.reset : null;
  const { role: viewer } = useTeamViewer();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<"staff" | "manager">("staff");
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const nameProblem = resetId ? null : pinNameProblem(name);
  const pinProblem = isPin(pin) ? null : "Choose 4 numbers.";
  const who = resetId ? (params.name ?? "them") : name.trim() || "them";

  async function save() {
    setTried(true);
    if (nameProblem || pinProblem) return;
    setBusy(true);
    setProblem(null);
    try {
      if (resetId) {
        await api.resetPinStaff(resetId, pin);
      } else {
        await api.createPinStaff({
          name: name.trim(),
          pin,
          ...(viewer === "owner" && role === "manager" ? { role } : {}),
          ...(photoFileId ? { photoFileId } : {}),
        });
      }
      router.back();
    } catch (error) {
      setProblem(pinFormProblem(error));
      setBusy(false);
    }
  }

  return (
    <FormScrollView contentClassName="gg-page gap-6 pb-10 pt-4">
      <View className="gap-2">
        <Text className="text-h1 text-text-primary" accessibilityRole="header">
          {resetId ? `New PIN for ${who}` : "Add staff with a PIN"}
        </Text>
        <Text className="text-body-lg text-text-secondary">
          {resetId
            ? "Their old PIN stops working now. Tell them the new one."
            : "For staff who use the shop's phone. No GRIDGO account needed."}
        </Text>
      </View>

      {resetId ? null : (
        <>
          <TeamPhotoPicker name={name} photoFileId={null} onStored={setPhotoFileId} disabled={busy} />
          <FieldShell label="Name" error={tried ? nameProblem : null}>
            <TextField value={name} onChange={setName} kind="name" placeholder="Ana" accessibilityLabel="Name" />
          </FieldShell>
        </>
      )}

      <FieldShell label="4-digit PIN" error={tried ? pinProblem : null}>
        <View className="w-60">
          <DigitBoxes
            value={pin}
            onChange={setPin}
            length={4}
            autoFocus={false}
            accessibilityLabel="4-digit PIN"
            testID="new-pin"
          />
        </View>
      </FieldShell>

      {!resetId && viewer === "owner" ? (
        <View className="gap-2">
          <SegmentedControl options={ROLE_OPTIONS} value={role} onChange={setRole} accessibilityLabel="Their role" />
          <Text className="text-body text-text-secondary">
            A manager can also change hours, products and staff. Only you see Money.
          </Text>
        </View>
      ) : null}

      <View className="flex-row items-start gap-3 rounded-card bg-surface-variant p-4">
        <Lock size={18} color={colors.textSecondary} aria-hidden />
        <Text className="min-w-0 flex-1 text-body text-text-secondary">
          The PIN works only on this shop&apos;s signed-in phone. Every job shows who handled it. Remove {who} any time
          and the PIN stops working.
        </Text>
      </View>

      {problem ? <ErrorNotice message={problem} /> : null}
      <PrimaryButton
        label={busy ? "Saving…" : resetId ? "Save the new PIN" : name.trim() ? `Add ${name.trim()}` : "Add them"}
        disabled={busy}
        onPress={() => void save()}
      />
    </FormScrollView>
  );
}
