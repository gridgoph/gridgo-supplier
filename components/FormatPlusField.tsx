import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Plus, X } from "lucide-react-native";

import { FORMAT_QUERY_MAX, UNOPENED_FILE_MESSAGE, type PublishedFileFormat } from "@/data/fileFormats";
import { singleLineFieldTextStyle } from "@/constants/theme";
import { resolveFormatQuery } from "@/lib/fileFormatResolve";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  formats: readonly PublishedFileFormat[];
  selected: readonly string[];
  onSelect: (code: string) => void;
  disabled?: boolean;
};

/**
 * Another type, from the type case.
 *
 * The chips already on the row are the shop's usual stock. This plus is the
 * drawer underneath the case: type the name the way a printer says it — AI,
 * EPS, TIFF — and GRIDGO either ticks a type it already opens, or says to take
 * a link. It is charcoal, never yellow. Yellow is the board action, not a
 * second way to add a chip.
 *
 * The field grows in place. A modal would lift the shop off the listing they
 * are editing, and a free-text type that only lived on this phone could never
 * be checked when a client sent the file.
 */
export function FormatPlusField({ formats, selected, onSelect, disabled }: Props) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setText("");
    setHint(null);
  }

  function find() {
    const found = resolveFormatQuery(text, formats);
    if (found.status === "empty") return;
    if (found.status === "matched" && found.format) {
      if (!selected.includes(found.format.code)) onSelect(found.format.code);
      close();
      return;
    }
    setHint(found.message ?? UNOPENED_FILE_MESSAGE);
  }

  function takeLink() {
    if (!selected.includes("other_link")) onSelect("other_link");
    close();
  }

  return (
    <>
      <Pressable
        onPress={() => (open ? close() : setOpen(true))}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: Boolean(disabled) }}
        accessibilityLabel={open ? "Close another type" : "Another type"}
        className="gg-chip gg-touch bg-surface px-3"
        style={({ pressed }) => (pressed && !disabled ? { opacity: 0.7 } : undefined)}
      >
        {open ? (
          <X size={14} color={colors.textSecondary} strokeWidth={2.5} />
        ) : (
          <Plus size={14} color={colors.textSecondary} strokeWidth={2.5} />
        )}
        <Text className="text-caption text-text-secondary">{open ? "Close" : "Another"}</Text>
      </Pressable>
      {open ? (
        <View className="w-full gap-2 pt-1">
          <TextInput
            value={text}
            onChangeText={(next) => {
              setText(next);
              if (hint) setHint(null);
            }}
            placeholder="AI, EPS, TIFF…"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Type of file they send"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={find}
            maxLength={FORMAT_QUERY_MAX}
            editable={!disabled}
            className="gg-field"
            style={singleLineFieldTextStyle}
          />
          {hint ? (
            <View className="gap-2">
              <Text className="text-body text-text-secondary">{hint}</Text>
              <Pressable
                onPress={takeLink}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel="Use Any other https link"
                className="self-start"
                style={({ pressed }) => (pressed && !disabled ? { opacity: 0.7 } : undefined)}
              >
                <Text className="text-body font-medium text-text-primary">
                  Use Any other https link
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text className="text-caption text-text-muted">
              Type the name or the extension. GRIDGO ticks it if it already opens
              that file.
            </Text>
          )}
        </View>
      ) : null}
    </>
  );
}
