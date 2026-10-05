import { Check, Search } from "lucide-react-native";
import { useMemo } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";

import { CropMarkFrame } from "@/components/CropMarkFrame";
import { DestinationRow } from "@/components/listing/DestinationRow";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import { notificationImageUrl } from "@/lib/api";
import { photoViewUrl } from "@/lib/listings";
import { filterProductTypes, type ProductTypeChoice } from "@/lib/productTypes";

type Props = {
  choices: ProductTypeChoice[];
  /** Category names, keyed by the shop's own category codes, for the group headings. */
  categoryNames: Record<string, string>;
  loading: boolean;
  query: string;
  onQuery: (value: string) => void;
  selected: string | null;
  onSelect: (choice: ProductTypeChoice) => void;
  /** Absent once the listing exists: its type is then changed in the editor. */
  onRequest?: (name: string) => void;
  /** True once the listing exists; the grid then shows only its own type. */
  locked?: boolean;
};

/**
 * Every product type the shop can list, as a wall of samples.
 *
 * Each tile is a real approved listing's sample, in the same crop marks as the
 * shop's own board, so the grid reads as "this is the kind of print" rather
 * than a menu of category words. A type nobody has listed yet has no photo; it
 * gets its initials set like a type specimen instead of a broken-image glyph.
 *
 * The search filters what is already here, so typing never waits on GRIDGO.
 * A search that finds nothing offers to ask Operations for that type by name.
 */
export function ProductTypeGrid({
  choices,
  categoryNames,
  loading,
  query,
  onQuery,
  selected,
  onSelect,
  onRequest,
  locked = false,
}: Props) {
  const colors = useThemeColors();
  const shown = useMemo(
    () => (locked ? choices.filter((choice) => choice.code === selected) : filterProductTypes(choices, query)),
    [choices, locked, query, selected],
  );
  const groups = useMemo(() => {
    const out: { code: string; choices: ProductTypeChoice[] }[] = [];
    for (const choice of shown) {
      const group = out.find((entry) => entry.code === choice.targetCategoryCode);
      if (group) group.choices.push(choice);
      else out.push({ code: choice.targetCategoryCode, choices: [choice] });
    }
    return out;
  }, [shown]);
  const headed = new Set(choices.map((choice) => choice.targetCategoryCode)).size > 1;

  if (loading && !choices.length) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading product types"
        className="gap-3"
      >
        <SkeletonBlock className="h-12 w-full rounded-field" />
        <View className="-mx-1.5 flex-row flex-wrap">
          {[0, 1, 2, 3].map((index) => (
            <View key={index} className="w-1/2 px-1.5 pb-3">
              <SkeletonBlock className="h-48 w-full rounded-card" />
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View className="gap-4">
      {locked ? null : (
        <View className="h-12 flex-row items-center rounded-field border border-outline bg-surface pl-3 pr-3">
          <Search size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder="Search product types"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Search product types"
            autoCorrect={false}
            returnKeyType="search"
            autoCapitalize="none"
            className="min-w-0 flex-1 text-body text-text-primary"
            style={SEARCH_TEXT}
          />
        </View>
      )}

      {groups.map((group) => (
        <View key={group.code} className="gap-2">
          {headed ? (
            <Text className="text-body font-medium text-text-secondary">
              {categoryNames[group.code] ?? "Your category"}
            </Text>
          ) : null}
          <View className="-mx-1.5 flex-row flex-wrap">
            {group.choices.map((choice) => (
              <View key={choice.code} className="w-1/2 px-1.5 pb-3">
                <TypeTile
                  choice={choice}
                  selected={choice.code === selected}
                  onPress={() => onSelect(choice)}
                />
              </View>
            ))}
          </View>
        </View>
      ))}

      {!shown.length && query.trim() ? (
        <View className="gg-panel gap-3">
          <Text className="text-body text-text-primary">
            No product type matches “{query.trim()}”.
          </Text>
          {onRequest ? (
            <>
              <Text className="text-body text-text-secondary">
                If you make it in your own shop, ask Operations to add it. You can list it once it is
                added.
              </Text>
              <View className="flex-row">
                <SecondaryButton
                  label="Request it as a new type"
                  onPress={() => onRequest(query.trim())}
                />
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {onRequest && !locked && (shown.length || !query.trim()) ? (
        <DestinationRow
          title="Request a new product type"
          detail="Something you make that is not here. Operations adds it to GRIDGO."
          onPress={() => onRequest("")}
        />
      ) : null}
    </View>
  );
}

function TypeTile({
  choice,
  selected,
  onPress,
}: {
  choice: ProductTypeChoice;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const uri = photoViewUrl(choice.photo) ?? notificationImageUrl(choice.imageUrl);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={choice.name}
      className={
        selected
          ? "rounded-card border-2 border-accent bg-surface-high"
          : "rounded-card border border-outline bg-surface"
      }
      style={({ pressed }) => [
        // The border grows by a pixel when picked; the padding gives it back so
        // the grid does not shift under the thumb.
        { padding: selected ? 0 : 1 },
        pressed ? { opacity: 0.7 } : null,
      ]}
    >
      <CropMarkFrame gutter="tight">
        <View className="w-full" style={{ aspectRatio: 1 }}>
          {uri ? (
            <Image
              source={{ uri }}
              accessibilityIgnoresInvertColors
              resizeMode="cover"
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Text className="text-h1 font-bold text-text-muted">{initials(choice.name)}</Text>
            </View>
          )}
        </View>
      </CropMarkFrame>
      {selected ? (
        <View
          className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-pill bg-accent"
          aria-hidden
        >
          <Check size={16} color={colors.accentOn} strokeWidth={3} />
        </View>
      ) : null}
      <View className="gap-0.5 px-3 pb-3">
        <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
          {choice.name}
        </Text>
        {choice.examples ? (
          <Text className="text-caption text-text-muted" numberOfLines={1}>
            {choice.examples}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** The board's own search field geometry: the row holds the glyph and the leading padding. */
const SEARCH_TEXT = {
  paddingStart: 8,
  paddingEnd: 0,
  paddingVertical: 0,
  includeFontPadding: false,
  textAlignVertical: "center",
} as const;

/** "Business & Store Signages" → "BS". The placeholder for a type with no sample yet. */
export function initials(name: string): string {
  const words = name
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter((word) => /^[A-Za-z0-9]/.test(word));
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}
