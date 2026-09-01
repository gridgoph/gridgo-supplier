import { Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { MoneyField } from "@/components/controls/MoneyField";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { TextField } from "@/components/controls/TextField";
import { formatPhp } from "@/lib/api";
import {
  LISTING_CAPS,
  multiplierLabel,
  pickLine,
  toMultiplierBps,
  type SpecGroup,
} from "@/lib/listings";
import { parseMoney } from "@/lib/money";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  group: SpecGroup;
  /** 1-based position, drawn only for steps — they are a sequence. */
  step: number | null;
  busy: boolean;
  onSetRequired: (required: boolean) => void;
  onAddOption: (
    label: string,
    priceModifierMinor: number,
    priceMultiplierBps: number | null,
  ) => Promise<boolean>;
  onRemoveOption: (optionId: string) => void;
  onRemoveGroup: () => void;
};

/**
 * One thing a client picks, shown to the shop the way the client will see it.
 *
 * The captain's reference is a food-order sheet, and the fix for an editor that
 * reads like a content management system is not softer labels — it is to put
 * the client's own view inside the card. So the card is in two halves: above
 * the rule is exactly what a client gets (the name, a Pick 1 or Optional chip,
 * and the choices with their money right-aligned in one column); below it are
 * the shop's controls. A shop reads the top half and knows what it has built.
 *
 * The money column is the tell. Right-aligned and in one line of sight, `+₱200`
 * under `+₱400` is a price list; scattered inline it is a form. Steps are
 * numbered and add-ons are not: a step is a sequence a client walks, an add-on
 * is a set they may tick, and numbering the second would claim an order that
 * does not exist.
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
  const [multiple, setMultiple] = useState("");
  const [direction, setDirection] = useState<"adds" | "takes" | "times">("adds");
  const [error, setError] = useState<string | null>(null);
  const full = group.options.length >= LISTING_CAPS.optionsPerGroup;

  async function add() {
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Name this choice first — a client picks it by its name.");
      return;
    }

    if (direction === "times") {
      const bps = toMultiplierBps(multiple);
      if (!bps) {
        setError("Say how many times the price this makes it — 2 for double.");
        return;
      }
      setError(null);
      // An extra multiplies or it adds. GRIDGO refuses both, so the amount is
      // deliberately not carried across when a shop switches to a multiple.
      if (await onAddOption(trimmed, 0, bps)) {
        setLabel("");
        setMultiple("");
        setDirection("adds");
      }
      return;
    }

    const money = parseMoney(amount);
    if (!money.ok) {
      setError(money.error);
      return;
    }
    const minor = (money.minor ?? 0) * (direction === "takes" ? -1 : 1);
    setError(null);
    if (await onAddOption(trimmed, minor, null)) {
      setLabel("");
      setAmount("");
      setDirection("adds");
    }
  }

  return (
    <View className="gg-card gap-4">
      {/* What a client sees. */}
      <View className="gap-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-body font-medium text-text-primary">
              {step != null ? `${step}. ${group.name}` : group.name}
            </Text>
            {group.helpText ? (
              <Text className="text-caption text-text-muted">{group.helpText}</Text>
            ) : null}
          </View>
          <View className="rounded-pill border border-outline px-2 py-0.5">
            <Text className="text-caption text-text-secondary">{pickLine(group)}</Text>
          </View>
        </View>

        {group.options.length ? (
          <View className="gap-2">
            {group.options.map((option) => (
              <View key={option.id} className="flex-row items-center gap-3">
                <Text
                  className="min-w-0 flex-1 text-body text-text-secondary"
                  numberOfLines={2}
                >
                  {option.label}
                </Text>
                <Text className="text-body text-text-primary">
                  {option.priceMultiplierBps
                    ? `${multiplierLabel(option.priceMultiplierBps)} the price`
                    : modifierLine(option.priceModifierMinor)}
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
              : "No choices yet. A step with nothing to pick stops this listing going on the board."}
          </Text>
        )}
      </View>

      <View className="gg-divider" />

      {/* What the shop sets. */}
      <View className="gap-3">
        {group.kind === "spec" ? (
          <SegmentedControl
            options={[
              { value: "required", label: "Pick 1" },
              { value: "optional", label: "Can skip" },
            ]}
            value={group.required ? "required" : "optional"}
            onChange={(value) => onSetRequired(value === "required")}
            accessibilityLabel={`Whether a client must choose ${group.name}`}
            disabled={busy}
          />
        ) : null}

        {full ? (
          <Text className="text-caption text-text-muted">
            That is all twenty choices. Remove one before adding another.
          </Text>
        ) : (
          <>
            <TextField
              value={label}
              onChange={(value) => setLabel(value.slice(0, LISTING_CAPS.optionLabelChars))}
              placeholder={group.kind === "addon" ? "Every 2 feet" : "4 × 8 ft"}
              accessibilityLabel={`New choice under ${group.name}`}
              kind="text"
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                {/*
                  A third shape, because some extras are a multiple rather than
                  an amount. "Back-to-back, x2 the price" written as a flat
                  figure has to be re-entered by hand every time the price
                  moves, and in practice stops being right — so a shop that
                  thinks in multiples can say so.
                */}
                <SegmentedControl
                  options={[
                    { value: "adds", label: "Adds" },
                    { value: "takes", label: "Takes off" },
                    { value: "times", label: "Multiplies" },
                  ]}
                  value={direction}
                  onChange={setDirection}
                  accessibilityLabel="Whether this choice adds to, takes off, or multiplies the price"
                  disabled={busy}
                />
              </View>
              <View className="flex-1">
                {direction === "times" ? (
                  <TextField
                    value={multiple}
                    onChange={setMultiple}
                    placeholder="2"
                    accessibilityLabel="How many times the price this choice makes it"
                    kind="text"
                  />
                ) : (
                  <MoneyField
                    value={amount}
                    onChange={setAmount}
                    accessibilityLabel="What this choice changes the price by"
                    editable={!busy}
                  />
                )}
              </View>
            </View>
            {error ? <Text className="text-caption text-error">{error}</Text> : null}
            <SecondaryButton
              label={busy ? "Saving…" : "Add choice"}
              disabled={busy}
              onPress={() => void add()}
            />
          </>
        )}

        <Pressable
          onPress={onRemoveGroup}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${group.name}`}
          className="gg-touch flex-row items-center gap-2 self-start"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Trash2 size={14} color={colors.textMuted} strokeWidth={2} />
          <Text className="text-caption text-text-muted">
            Remove {group.kind === "addon" ? "this add-on" : "this step"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** "+₱150.00", "−₱50.00", or "Included" — never a bare signed number. */
export function modifierLine(minor: number): string {
  if (minor === 0) return "Included";
  return minor > 0 ? `+${formatPhp(minor)}` : `−${formatPhp(Math.abs(minor))}`;
}

/**
 * Opening a step or an add-on.
 *
 * The name and the first choice are asked for together because GRIDGO will not
 * hold an empty group, and it is right not to: a step with nothing under it is
 * a question a client cannot answer. Asking for both at once is also what the
 * shop was going to type anyway — "Rush" is not a thing you add without knowing
 * it costs ₱200.
 */
export function AddGroupButton({
  kind,
  busy,
  onAdd,
}: {
  kind: "spec" | "addon";
  busy: boolean;
  onAdd: (input: {
    name: string;
    firstOption: { label: string; priceModifierMinor: number };
  }) => Promise<boolean>;
}) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setName("");
    setLabel("");
    setAmount("");
    setError(null);
  }

  async function submit() {
    if (!name.trim() || !label.trim()) {
      setError("GRIDGO needs the name and one choice a client can pick.");
      return;
    }
    const money = parseMoney(amount);
    if (!money.ok) {
      setError(money.error);
      return;
    }
    setError(null);
    if (
      await onAdd({
        name: name.trim(),
        firstOption: { label: label.trim(), priceModifierMinor: money.minor ?? 0 },
      })
    ) {
      close();
    }
  }

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
        onChange={(value) => setName(value.slice(0, LISTING_CAPS.nameChars))}
        placeholder={kind === "addon" ? "Rush" : "Size"}
        accessibilityLabel={kind === "addon" ? "Add-on name" : "Step name"}
        kind="text"
      />

      <Text className="text-caption text-text-muted">
        {kind === "addon"
          ? "And the first thing a client can add, with what it costs."
          : "And the first thing a client can pick, with what it changes."}
      </Text>
      <TextField
        value={label}
        onChange={(value) => setLabel(value.slice(0, LISTING_CAPS.optionLabelChars))}
        placeholder={kind === "addon" ? "Ready in 24 hours" : "2 × 3 ft"}
        accessibilityLabel="First choice"
        kind="text"
      />
      <MoneyField
        value={amount}
        onChange={setAmount}
        accessibilityLabel="What this choice adds to the price"
        editable={!busy}
      />
      <Text className="text-caption text-text-muted">
        Leave the amount empty if it is included in your price.
      </Text>

      {error ? <Text className="text-caption text-error">{error}</Text> : null}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <SecondaryButton label="Cancel" disabled={busy} onPress={close} />
        </View>
        <View className="flex-1">
          <SecondaryButton
            label={busy ? "Saving…" : "Add"}
            disabled={busy}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </View>
  );
}
