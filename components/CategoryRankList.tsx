import { ArrowUp, Plus, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

export type RankableCategory = {
  code: string;
  name: string;
  /** Who the category is for, in the catalogue's own words. */
  bestFor: string;
};

type Props = {
  categories: readonly RankableCategory[];
  /** Chosen codes, best first. Position is the rank. */
  value: string[];
  onToggle: (code: string) => void;
  onPromote: (code: string) => void;
};

/**
 * What a shop does, in the order it does it best.
 *
 * The numbering is the data, not decoration: GRIDGO matches on rank, so first
 * place means "send me this before anything else". A shop adds a category by
 * tapping it, which puts it at the bottom of what it has chosen, moves it up
 * one place at a time, and drops it with the X — the same toggle as adding,
 * drawn as a close so it cannot be mistaken for "done".
 */
export function CategoryRankList({ categories, value, onToggle, onPromote }: Props) {
  const colors = useThemeColors();
  const chosen = value
    .map((code) => categories.find((category) => category.code === code))
    .filter((category): category is RankableCategory => category != null);
  const rest = categories.filter((category) => !value.includes(category.code));

  return (
    <View className="gap-4">
      {chosen.length ? (
        <View className="gap-2">
          {chosen.map((category, index) => (
            <View
              key={category.code}
              className="flex-row items-center gap-3 rounded-field border border-accent bg-surface px-3 py-2"
            >
              <Text
                className="text-body font-bold text-text-primary"
                accessibilityLabel={`Rank ${index + 1}`}
              >
                {index + 1}
              </Text>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-body font-medium text-text-primary">
                  {category.name}
                </Text>
                <Text className="text-caption text-text-muted">
                  {index === 0 ? "What you do best" : `Your ${ordinal(index + 1)} choice`}
                </Text>
              </View>
              {index > 0 ? (
                <Pressable
                  onPress={() => onPromote(category.code)}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${category.name} up to rank ${index}`}
                  className="gg-touch items-center justify-center"
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                >
                  <ArrowUp size={20} color={colors.textSecondary} strokeWidth={2} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => onToggle(category.code)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${category.name}`}
                className="gg-touch items-center justify-center"
                style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
              >
                <X size={20} color={colors.textMuted} strokeWidth={2} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {rest.length ? (
        <View className="gap-2">
          {chosen.length ? (
            <Text className="text-caption text-text-muted">
              Tap to add. Anything you add goes to the bottom of your list.
            </Text>
          ) : null}
          {rest.map((category) => (
            <Pressable
              key={category.code}
              onPress={() => onToggle(category.code)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${category.name}`}
              className="gg-touch flex-row items-start gap-3 rounded-field border border-outline bg-surface px-3 py-3"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <Plus size={20} color={colors.textMuted} strokeWidth={2} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-body text-text-secondary">{category.name}</Text>
                <Text className="text-caption text-text-muted">{category.bestFor}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ordinal(n: number): string {
  if (n === 2) return "second";
  if (n === 3) return "third";
  if (n === 4) return "fourth";
  return `${n}th`;
}
