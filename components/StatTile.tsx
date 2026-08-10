import { Text, View } from "react-native";

type Props = {
  label: string;
  value: number | string;
  /** Reads as a problem rather than an inventory count. */
  tone?: "default" | "error";
  /** One short line under the label, where the number needs context. */
  hint?: string;
};

/**
 * One counted fact.
 *
 * The number carries the weight and the label sits under it quietly — a tile
 * where both are 14px tells the eye nothing. Zero is stated as a word so a row
 * of tiles does not read as four identical noughts.
 */
export function StatTile({ label, value, tone = "default", hint }: Props) {
  const empty = value === 0;
  // Nothing is stated as a word, but quietly — a row of tiles should read as
  // one number worth looking at, not three shouted noughts.
  const numberClass = empty
    ? "text-h3 text-text-muted"
    : tone === "error"
      ? "text-h1 text-error"
      : "text-h1 text-text-primary";

  return (
    <View className="flex-1 justify-end rounded-card border border-outline bg-surface px-4 py-3">
      <Text className={numberClass} numberOfLines={1} adjustsFontSizeToFit>
        {empty ? "None" : value}
      </Text>
      <Text className="mt-0.5 text-caption text-text-muted" numberOfLines={2}>
        {label}
      </Text>
      {hint ? (
        <Text className="mt-1 text-caption text-text-muted" numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
