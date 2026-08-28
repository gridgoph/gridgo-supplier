import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { NoteField } from "@/components/controls/NoteField";
import { TextField } from "@/components/controls/TextField";
import type { PrepStep } from "@/lib/listings";
import { useThemeColors } from "@/hooks/useTheme";

/** A step's title is a glance; its body is the instruction. */
export const PREP_STEP_TITLE_CHARS = 80;
export const PREP_STEP_BODY_CHARS = 400;

/**
 * What a client does before it sends work.
 *
 * Numbered, and the number is drawn in a square rather than a circle. That is
 * not decoration: a circle reads as a bullet, and these are a sequence a client
 * walks in order — flatten the layers, then outline the fonts, then export. The
 * square also belongs to this app's own language, where a trimmed edge is the
 * house shape.
 *
 * This is deliberately not Size or Material. Those are choices a client makes;
 * these are instructions a shop gives, and a specialised printer's whole margin
 * can live in whether the artwork arrived flattened.
 */
export function PrepStepRow({
  step,
  position,
  busy,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  step: PrepStep;
  position: number;
  busy: boolean;
  onRemove?: () => void;
  /** Absent on the first step up and the last step down, and on the preview. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const colors = useThemeColors();
  const editing = Boolean(onRemove || onMoveUp || onMoveDown);

  return (
    <View className="gap-2 rounded-card border border-outline bg-surface p-3">
      <View className="flex-row items-start gap-3">
        <View className="h-7 w-7 items-center justify-center rounded-sm border border-outline bg-surface-variant">
          <Text className="text-caption font-medium text-text-primary">{position}</Text>
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body font-medium text-text-primary">{step.title}</Text>
          {step.body ? (
            <Text className="text-body text-text-secondary">{step.body}</Text>
          ) : null}
        </View>
      </View>

      {/*
        Every control on the step sits in one row at its foot, so the instruction
        above it is read as an instruction rather than as a form row. Moving is
        two arrows rather than a drag handle: the order is the whole point of
        these — flatten before you export — and a shop reordering three of them
        on a phone it is holding at its counter should not have to hold a card
        still while a scroll view fights it for the same drag.
      */}
      {editing ? (
        <View className="flex-row items-center justify-end gap-1">
          <StepControl
            glyph="up"
            label={`Move step ${position}, ${step.title}, earlier`}
            color={colors.textMuted}
            busy={busy}
            onPress={onMoveUp}
          />
          <StepControl
            glyph="down"
            label={`Move step ${position}, ${step.title}, later`}
            color={colors.textMuted}
            busy={busy}
            onPress={onMoveDown}
          />
          <StepControl
            glyph="remove"
            label={`Remove step ${position}, ${step.title}`}
            color={colors.textMuted}
            busy={busy}
            onPress={onRemove}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * One control on a step.
 *
 * An arrow with nowhere to go is drawn faint rather than taken away, so the row
 * of controls sits in the same place on the first step, the last, and every one
 * between — a control that moves as the list is reordered is a control that has
 * to be found again after every tap.
 */
function StepControl({
  glyph,
  label,
  color,
  busy,
  onPress,
}: {
  glyph: "up" | "down" | "remove";
  label: string;
  color: string;
  busy: boolean;
  onPress?: () => void;
}) {
  const Glyph = glyph === "up" ? ArrowUp : glyph === "down" ? ArrowDown : Trash2;

  return (
    <Pressable
      onPress={onPress}
      disabled={busy || !onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy || !onPress }}
      className="gg-touch h-11 w-11 items-center justify-center rounded-field border border-outline"
      style={({ pressed }) => ({ opacity: !onPress ? 0.35 : pressed ? 0.6 : 1 })}
    >
      <Glyph size={16} color={color} strokeWidth={2} />
    </Pressable>
  );
}

/**
 * Adding one instruction.
 *
 * A title and the thing to actually do, because a client scanning three steps
 * reads the titles and only opens the one it is unsure about. New steps join
 * the end of the list — the order a shop writes them in is the order it wants
 * them done.
 */
export function AddPrepStepButton({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (input: { title: string; body: string }) => Promise<boolean>;
}) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setTitle("");
    setBody("");
    setError(null);
  }

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        disabled={busy}
        accessibilityRole="button"
        // The pick sequence has an "Add a step" too. On screen the heading
        // above each one tells them apart; read aloud, nothing would.
        accessibilityLabel="Add a step to Before they order"
        className="gg-touch flex-row items-center justify-center gap-2 rounded-field border border-outline bg-surface px-4 py-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <Plus size={16} color={colors.textPrimary} strokeWidth={2} />
        <Text className="text-button text-text-primary">Add a step</Text>
      </Pressable>
    );
  }

  return (
    <View className="gg-card gap-3">
      <Text className="text-body font-medium text-text-primary">
        What should a client do before they send this work?
      </Text>
      <TextField
        value={title}
        onChange={(value) => setTitle(value.slice(0, PREP_STEP_TITLE_CHARS))}
        placeholder="Flatten your artwork"
        accessibilityLabel="Step title"
        kind="text"
      />
      <NoteField
        value={body}
        onChange={setBody}
        placeholder="Export a single flattened PDF at 150 dpi. Layered files come back to you."
        accessibilityLabel="What to do"
        maxLength={PREP_STEP_BODY_CHARS}
      />
      {error ? <Text className="text-caption text-error">{error}</Text> : null}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <SecondaryButton label="Cancel" disabled={busy} onPress={close} />
        </View>
        <View className="flex-1">
          <SecondaryButton
            label={busy ? "Saving…" : "Add step"}
            disabled={busy}
            onPress={() => {
              void (async () => {
                if (!title.trim()) {
                  setError("Give the step a title a client can scan.");
                  return;
                }
                setError(null);
                if (await onAdd({ title: title.trim(), body: body.trim() })) close();
              })();
            }}
          />
        </View>
      </View>
    </View>
  );
}
