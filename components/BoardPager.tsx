import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  page: number;
  pageCount: number;
  /** The first and last listing on this page, counted across the whole board. */
  from: number;
  to: number;
  total: number;
  /** False on the last page GRIDGO offered a cursor for. */
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
};

/**
 * One page of the board, when it does not fit on one screen.
 *
 * Previous and next, and which page this is — not infinite scroll. A shop that
 * asked for pages should be able to say "the second page of flyers".
 *
 * The pages themselves come off GRIDGO's cursor, so forward is a cursor and
 * back is one the screen already holds; there is no jumping to page four. What
 * makes the sentence still true is `total`, which GRIDGO counts across every
 * page of the same question the shop asked.
 */
export function BoardPager({ page, pageCount, from, to, total, hasNext, onPrev, onNext }: Props) {
  const colors = useThemeColors();
  if (pageCount <= 1) return null;

  const first = page <= 1;

  return (
    <View className="mt-6 gap-3">
      <Text className="text-center text-caption text-text-muted">
        {from}–{to} of {total}
      </Text>
      <View className="flex-row items-center justify-center gap-4">
        <Pressable
          onPress={onPrev}
          disabled={first}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
          accessibilityState={{ disabled: first }}
          className={first ? "gg-touch items-center justify-center gg-disabled" : "gg-touch items-center justify-center"}
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <ChevronLeft size={22} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text className="text-body text-text-primary" accessibilityLabel={`Page ${page} of ${pageCount}`}>
          Page {page} of {pageCount}
        </Text>
        <Pressable
          onPress={onNext}
          disabled={!hasNext}
          accessibilityRole="button"
          accessibilityLabel="Next page"
          accessibilityState={{ disabled: !hasNext }}
          className={
            hasNext
              ? "gg-touch items-center justify-center"
              : "gg-touch items-center justify-center gg-disabled"
          }
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <ChevronRight size={22} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}
