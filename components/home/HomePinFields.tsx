import { Lock } from "lucide-react-native";
import { Text, View } from "react-native";

import { ShopLocationPicker } from "@/components/ShopLocationPicker";
import { CheckboxRow } from "@/components/controls/CheckboxRow";
import { FieldShell } from "@/components/controls/FieldShell";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { TextField } from "@/components/controls/TextField";
import { useThemeColors } from "@/hooks/useTheme";
import { WHY_WE_ASK } from "@/lib/legal";
import { PROPERTY_OPTIONS, type HomePinDraft, type HomePinProblems } from "@/lib/homePrinter";

type Props = {
  draft: HomePinDraft;
  onChange: (next: Partial<HomePinDraft>) => void;
  /** Shown only after a first try. */
  problems: HomePinProblems;
  /** GRIDGO's consent sentence, drawn and sent back word for word. */
  wording: string;
  consented: boolean;
  onConsent: (value: boolean) => void;
  onSearchFocusChange?: (focused: boolean) => void;
  onBlockerChange?: (problem: string | null) => void;
};

/**
 * A home printer's private pin (gridgo-api#412): the map, barangay, street,
 * house or boarding house, an optional landmark, and the one consent.
 *
 * The reassurance sits right above the consent on purpose. Someone asked to
 * pin their own home needs to read who sees what before they tick, in plain
 * words, and GRIDGO's exact sentence is what they tick.
 */
export function HomePinFields({
  draft,
  onChange,
  problems,
  wording,
  consented,
  onConsent,
  onSearchFocusChange,
  onBlockerChange,
}: Props) {
  const colors = useThemeColors();

  return (
    <View className="gap-6">
      <View className="gap-2">
        <ShopLocationPicker
          pin={draft.pin}
          onChange={(pin) => onChange({ pin })}
          searchPlaceholder="Search your street"
          onSearchFocusChange={onSearchFocusChange}
          onBlockerChange={onBlockerChange}
          whyWeAsk={WHY_WE_ASK.homePin}
        />
        {problems.pin ? <Text className="text-caption text-error">{problems.pin}</Text> : null}
      </View>

      <FieldShell label="Barangay" error={problems.barangay ?? null}>
        <TextField
          value={draft.barangay}
          onChange={(barangay) => onChange({ barangay })}
          kind="name"
          placeholder="For example, Buhangin"
          accessibilityLabel="Barangay"
        />
      </FieldShell>

      <FieldShell label="Street" hint="The street name only. No house number." error={problems.street ?? null}>
        <TextField
          value={draft.street}
          onChange={(street) => onChange({ street })}
          kind="name"
          placeholder="For example, Mabini Street"
          accessibilityLabel="Street"
        />
      </FieldShell>

      <FieldShell label="You live in a" error={problems.propertyType ?? null}>
        <SegmentedControl
          options={PROPERTY_OPTIONS}
          value={draft.propertyType}
          onChange={(propertyType) => onChange({ propertyType })}
          accessibilityLabel="You live in a"
        />
      </FieldShell>

      <FieldShell label="Landmark" hint="Optional. Helps your rider find the door.">
        <TextField
          value={draft.landmark}
          onChange={(landmark) => onChange({ landmark })}
          kind="text"
          placeholder="For example, blue gate near the chapel"
          accessibilityLabel="Landmark"
        />
      </FieldShell>

      <View className="gap-3 rounded-card border border-outline bg-surface p-4" testID="home-privacy">
        <View className="flex-row items-center gap-2">
          <Lock size={18} color={colors.success} strokeWidth={2.25} aria-hidden />
          <Text className="text-body font-bold text-text-primary">Your address stays private</Text>
        </View>
        <PrivacyLine text="Clients see only your barangay and a rough distance. Never your pin." />
        <PrivacyLine text="Your rider sees your exact pin only during a job." />
        <PrivacyLine text="Your street shows only to a paid client picking up, if you allow pickup at home later." />
      </View>

      {wording ? (
        <View className="gap-2" testID="home-pin-consent">
          <CheckboxRow checked={consented} onChange={onConsent} label={wording} />
          {problems.consent ? <Text className="text-caption text-error">{problems.consent}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function PrivacyLine({ text }: { text: string }) {
  return (
    <View className="flex-row gap-2">
      <Text className="text-body text-text-muted" aria-hidden>
        •
      </Text>
      <Text className="min-w-0 flex-1 text-body text-text-secondary">{text}</Text>
    </View>
  );
}
