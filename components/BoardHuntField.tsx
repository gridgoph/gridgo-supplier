import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Search, X } from "lucide-react-native";

import { MAX_HUNT_LENGTH } from "@/lib/catalogueBoard";
import { useThemeColors } from "@/hooks/useTheme";

/** How long the shop stops typing before the wall goes and looks. */
export const HUNT_DEBOUNCE_MS = 250;

type Props = {
  /** The hunt the wall is currently answering. */
  value: string;
  /** Called with the hunt to run — debounced while typing, at once on Enter. */
  onHunt: (value: string) => void;
  /** True while the field has the caret, so the rail can fold its filters. */
  onFocusChange?: (focused: boolean) => void;
};

/**
 * Find a sample.
 *
 * A print shop's board is a wall, and this is the shop walking up to it — not a
 * search product. So it is a charcoal tool sitting in the rail above the wall,
 * never a scene of its own: no modal, no full-screen overlay, no floating
 * magnifier. The wall stays the body and the result stays where the shop was
 * already looking. Yellow is spent on the one action that puts a new sample up.
 *
 * Three behaviours it owns rather than the screen:
 *
 * - **The 250ms wait.** GRIDGO ranks this in PostgreSQL, so a request per
 *   keystroke is a request per keystroke. The field holds what is typed and
 *   asks once the shop stops.
 * - **Enter goes now.** A shop that has finished typing should not wait out a
 *   timer it cannot see.
 * - **Eighty characters, held here.** GRIDGO refuses more and answers an error;
 *   a shop should watch the line stop rather than watch the wall break.
 *
 * Clear is a control, not an X drawn on the border: it carries a 44pt target
 * and a name, because a shop clearing a hunt one-handed at the counter is the
 * ordinary case, not the recovery case.
 */
export function BoardHuntField({ value, onHunt, onFocusChange }: Props) {
  const colors = useThemeColors();
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emitted = useRef(value);
  /**
   * What is in the box right now, readable without a re-render.
   *
   * The search key can arrive in the same tick as the last character, before
   * React has re-run this component — so an Enter that read the rendered state
   * would hunt for everything up to the second-to-last letter.
   */
  const typed = useRef(value);

  // The wall can clear the hunt too — the empty-hunt copy offers exactly that.
  // Only follow the wall when it moved somewhere this field did not send it.
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    typed.current = value;
    setText(value);
  }, [value]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function hunt(next: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (next === emitted.current) return;
    emitted.current = next;
    onHunt(next);
  }

  function type(next: string) {
    typed.current = next;
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => hunt(next), HUNT_DEBOUNCE_MS);
  }

  function focus(is: boolean) {
    setFocused(is);
    onFocusChange?.(is);
  }

  const active = focused || text.length > 0;

  return (
    <View
      className={
        active
          ? "h-12 flex-row items-center rounded-field border border-accent bg-surface pl-3"
          : "h-12 flex-row items-center rounded-field border border-outline bg-surface pl-3"
      }
    >
      <Search
        size={18}
        color={active ? colors.textPrimary : colors.textMuted}
        strokeWidth={2}
      />
      <TextInput
        value={text}
        onChangeText={type}
        onFocus={() => focus(true)}
        onBlur={() => focus(false)}
        onSubmitEditing={() => hunt(typed.current)}
        placeholder="Find a sample"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Find a sample on your board"
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        maxLength={MAX_HUNT_LENGTH}
        className="min-w-0 flex-1 text-body text-text-primary"
        style={FIELD_TEXT}
      />
      {text.length > 0 ? (
        <Pressable
          onPress={() => {
            typed.current = "";
            setText("");
            hunt("");
          }}
          accessibilityRole="button"
          accessibilityLabel="Clear"
          className="h-11 w-11 items-center justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <X size={18} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
      ) : (
        <View className="w-3" />
      )}
    </View>
  );
}

/**
 * The glyph metrics, in `style` rather than classes.
 *
 * Android's inner EditText can resolve a className padding declaration after
 * `style` and put the text back against the stroke — the same reason
 * `singleLineFieldTextStyle` exists. This field cannot use that one: its
 * leading padding belongs to the row, which is already holding the glyph.
 */
const FIELD_TEXT = {
  paddingStart: 8,
  paddingEnd: 0,
  paddingVertical: 0,
  includeFontPadding: false,
  textAlignVertical: "center",
} as const;
