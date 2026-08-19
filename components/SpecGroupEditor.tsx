import { Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { MoneyField } from "@/components/controls/MoneyField";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { TextField } from "@/components/controls/TextField";
import { formatPhp } from "@/lib/api";
import { LISTING_CAPS, type SpecGroup } from "@/lib/listings";
import { parseMoney } from "@/lib/money";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  group: SpecGroup;
  /** 1-based position, drawn only for steps — they are a sequence. */
  step: number | null;
  busy: boolean;
  onSetRequired: (required: boolean) => void;
  onAddOption: (label: string, priceModifierMinor: number) => Promise<boolean>;
  onRemoveOption: (optionId: string) => void;
  onRemoveGroup: () => void;
};

/**
 * One step a customer walks, or one extra they can add.
 *
 * Steps are numbered because they genuinely are a sequence — size, then media,
 * then sides is the order the client fills the form in, and the order here is
 * that order. Add-ons are not numbered: they are a set of extras, and numbering
 * them would imply an order that does not exist.
 *
 * A price is written the way a shop says it out loud: the option, then what it
 * adds or takes off. Negative modifiers are real — a shop that charges less for
 * greyscale is not doing anything unusual — so the sign is a control rather
 * than a minus sign typed into a money field.
 */
export function SpecGroupEditor({
  group,
  step,
  busy,
  onSetRequired,
  onAddOption,
  onRemoveOption,
  onRemoveGroup,
}: Props) {
  const colors = useThemeColors();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"adds" | "takes">("adds");
  const [error, setError] = useState<string | null>(null);
  const full = group.options.length >= LISTING_CAPS.optionsPerGroup;

  async function add() {
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Name this option first — a client picks it by its name.");
      return;
    }
    const money = parseMoney(amount);
    if (!money.ok) {
      setError(money.error);
      return;
    }
    const minor = (money.minor ?? 0) * (direction === "takes" ? -1 : 1);
    setError(null);
    if (await onAddOption(trimmed, minor)) {
      setLabel("");
      setAmount("");
      setDirection("adds");
    }
  }

  return (
    <View className="gg-card gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body font-medium text-text-primary">
            {step != null ? `${step}. ${group.name}` : group.name}
          </Text>
          {group.helpText ? (
            <Text className="text-caption text-text-muted">{group.helpText}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={onRemoveGroup}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${group.name}`}
          className="gg-touch items-center justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Trash2 size={18} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
      </View>

      {group.kind === "spec" ? (
        <SegmentedControl
          options={[
            { value: "required", label: "Must choose" },
            { value: "optional", label: "Can skip" },
          ]}
          value={group.required ? "required" : "optional"}
          onChange={(value) => onSetRequired(value === "required")}
          accessibilityLabel={`Whether a client must choose ${group.name}`}
          disabled={busy}
        />
      ) : null}

      {group.options.length ? (
        <View className="gap-2">
          {group.options.map((option) => (
            <View
              key={option.id}
              className="flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3 py-2"
            >
              <Text className="min-w-0 flex-1 text-body text-text-primary" numberOfLines={2}>
                {option.label}
              </Text>
              <Text className="text-caption text-text-secondary">
                {modifierLine(option.priceModifierMinor)}
              </Text>
              <Pressable
                onPress={() => onRemoveOption(option.id)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${option.label}`}
                className="gg-touch items-center justify-center"
                style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
              >
                <Trash2 size={16} color={colors.textMuted} strokeWidth={2} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-body text-text-secondary">
          {group.kind === "addon"
            ? "No extras under this yet. A client sees nothing until you add one."
            : "No options yet. A step with nothing to choose stops this listing going on the board."}
        </Text>
      )}

      {full ? (
        <Text className="text-caption text-text-muted">
          That is all twenty options. Remove one before adding another.
        </Text>
      ) : (
        <View className="gap-3">
          <TextField
            value={label}
            onChange={(value) => setLabel(value.slice(0, LISTING_CAPS.optionLabelChars))}
            placeholder={group.kind === "addon" ? "Lamination" : "4 × 8 ft"}
            accessibilityLabel={`New option under ${group.name}`}
            kind="text"
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <SegmentedControl
                options={[
                  { value: "adds", label: "Adds" },
                  { value: "takes", label: "Takes off" },
                ]}
                value={direction}
                onChange={setDirection}
                accessibilityLabel={`Whether this option adds to or takes off the price`}
                disabled={busy}
              />
            </View>
            <View className="flex-1">
              <MoneyField
                value={amount}
                onChange={setAmount}
                accessibilityLabel={`What this option changes the price by`}
                editable={!busy}
              />
            </View>
          </View>
          {error ? <Text className="text-caption text-error">{error}</Text> : null}
          <SecondaryButton
            label={busy ? "Saving…" : "Add option"}
            disabled={busy}
            onPress={() => void add()}
          />
        </View>
      )}
    </View>
  );
}

/** "+₱150.00", "−₱50.00", or "No change" — never a bare signed number. */
export function modifierLine(minor: number): string {
  if (minor === 0) return "No change";
  return minor > 0 ? `+${formatPhp(minor)}` : `−${formatPhp(Math.abs(minor))}`;
}

/** The button that opens a new step or extra. Kept beside the editor it feeds. */
export function AddGroupButton({
  kind,
  busy,
  onAdd,
}: {
  kind: "spec" | "addon";
  busy: boolean;
  onAdd: (name: string) => Promise<boolean>;
}) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={kind === "addon" ? "Add an add-on" : "Add a step"}
        className="gg-touch flex-row items-center justify-center gap-2 rounded-field border border-outline bg-surface px-4 py-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <Plus size={16} color={colors.textPrimary} strokeWidth={2} />
        <Text className="text-button text-text-primary">
          {kind === "addon" ? "Add an add-on" : "Add a step"}
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="gg-card gap-3">
      <Text className="text-body font-medium text-text-primary">
        {kind === "addon" ? "What is the extra called?" : "What does this step choose?"}
      </Text>
      <TextField
        value={name}
        onChange={setName}
        placeholder={kind === "addon" ? "Grommets" : "Size"}
        accessibilityLabel={kind === "addon" ? "Add-on name" : "Step name"}
        kind="text"
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <SecondaryButton
            label="Cancel"
            disabled={busy}
            onPress={() => {
              setOpen(false);
              setName("");
            }}
          />
        </View>
        <View className="flex-1">
          <SecondaryButton
            label={busy ? "Saving…" : "Add"}
            disabled={busy || !name.trim()}
            onPress={() => {
              void (async () => {
                if (await onAdd(name.trim())) {
                  setName("");
                  setOpen(false);
                }
              })();
            }}
          />
        </View>
      </View>
    </View>
  );
}
