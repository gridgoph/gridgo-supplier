import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

/**
 * One page of the board, when it does not fit on one screen.
 *
 * Previous and next, and which page this is — not infinite scroll. A shop that
 * asked for pages should be able to say "the second page of flyers".
 */
export function BoardPager({ page, pageCount, total, pageSize, onPageChange }: Props) {
  const colors = useThemeColors();
  if (pageCount <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <View className="mt-6 gap-3">
      <Text className="text-center text-caption text-text-muted">
        {from}–{to} of {total}
      </Text>
      <View className="flex-row items-center justify-center gap-4">
        <Pressable
          onPress={() => onPageChange(page - 1)}
          disabled={page <= 1}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
          accessibilityState={{ disabled: page <= 1 }}
          className={page <= 1 ? "gg-touch items-center justify-center gg-disabled" : "gg-touch items-center justify-center"}
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <ChevronLeft size={22} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text className="text-body text-text-primary" accessibilityLabel={`Page ${page} of ${pageCount}`}>
          Page {page} of {pageCount}
        </Text>
        <Pressable
          onPress={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          accessibilityRole="button"
          accessibilityLabel="Next page"
          accessibilityState={{ disabled: page >= pageCount }}
          className={
            page >= pageCount
              ? "gg-touch items-center justify-center gg-disabled"
              : "gg-touch items-center justify-center"
          }
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <ChevronRight size={22} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}
