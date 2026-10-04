import { ArrowUp, ChevronDown, ChevronUp, Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { productNames, productsToggleLabel, type CategoryProduct } from "@/lib/inHouse";

export type RankableCategory = {
  code: string;
  name: string;
  /** Who the category is for, in the catalogue's own words. */
  bestFor: string;
  /** What sits in the category, so a shop can find where its products are. */
  products?: readonly CategoryProduct[];
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
 *
 * Under each category its products are named, and a disclosure opens what
 * each one covers. The products are there to be read, not picked: a shop
 * declares a category, and chooses products later as listings.
 */
export function CategoryRankList({ categories, value, onToggle, onPromote }: Props) {
  const colors = useThemeColors();
  const chosen = value
    .map((code) => categories.find((category) => category.code === code))
    .filter((category): category is RankableCategory => category != null);
  const rest = categories.filter((category) => !value.includes(category.code));
  const [open, setOpen] = useState<string[]>([]);

  function toggleOpen(code: string) {
    setOpen((current) =>
      current.includes(code) ? current.filter((entry) => entry !== code) : [...current, code],
    );
  }

  return (
    <View className="gap-4">
      {chosen.length ? (
        <View className="gap-2">
          {chosen.map((category, index) => (
            <View key={category.code} className="rounded-field border border-accent bg-surface">
              <View className="flex-row items-center gap-3 px-3 py-2">
                <Text
                  className="w-5 text-center text-body font-bold text-text-primary"
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
              <CategoryProducts
                category={category}
                open={open.includes(category.code)}
                onToggle={() => toggleOpen(category.code)}
              />
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
            <View key={category.code} className="rounded-field border border-outline bg-surface">
              <Pressable
                onPress={() => onToggle(category.code)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${category.name}`}
                className="gg-touch flex-row items-start gap-3 px-3 pb-2 pt-3"
                style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
              >
                <View className="w-5 items-center">
                  <Plus size={20} color={colors.textMuted} strokeWidth={2} />
                </View>
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-body text-text-secondary">{category.name}</Text>
                  <Text className="text-caption text-text-muted">{category.bestFor}</Text>
                </View>
              </Pressable>
              <CategoryProducts
                category={category}
                open={open.includes(category.code)}
                onToggle={() => toggleOpen(category.code)}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The products on a category's shelf: named in one line while closed, and
 * each with what it covers once open. Indented to the category's name so the
 * card reads as one thing, not two.
 */
function CategoryProducts({
  category,
  open,
  onToggle,
}: {
  category: RankableCategory;
  open: boolean;
  onToggle: () => void;
}) {
  const colors = useThemeColors();
  const products = category.products ?? [];
  if (!products.length) return null;

  const label = productsToggleLabel(products.length, open);
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <View className="gap-1 pb-1 pl-11 pr-3">
      {open ? (
        <View className="gap-3 border-l border-outline pl-3 pt-1">
          {products.map((product) => (
            <View key={product.code} className="gap-0.5">
              <Text className="text-caption font-medium text-text-primary">{product.name}</Text>
              <Text className="text-caption text-text-muted">{product.examples}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-caption text-text-secondary">{productNames(products)}</Text>
      )}
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}, ${category.name}`}
        className="gg-touch flex-row items-center gap-1 self-start"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <Text className="text-caption font-medium text-text-primary">{label}</Text>
        <Chevron size={16} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      </Pressable>
    </View>
  );
}

function ordinal(n: number): string {
  if (n === 2) return "second";
  if (n === 3) return "third";
  if (n === 4) return "fourth";
  return `${n}th`;
}
