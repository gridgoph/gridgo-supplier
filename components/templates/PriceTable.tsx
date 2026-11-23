import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { MoneyField } from "@/components/controls/MoneyField";
import { useThemeColors } from "@/hooks/useTheme";
import { outsideUsualRange, unitLabel, type DraftRow, type ProductTemplate } from "@/lib/productTemplates";

/**
 * The full price for each option the shop makes.
 *
 * Every row is a whole price — "A4 / Colour: ₱12 per page" — never an amount
 * added to a base, which is what had shops typing ₱0 and getting it listed.
 * Untick what the shop does not make. A ticked row with no price, or ₱0, says
 * so on the row once the shop has tried to go on (`showErrors`), in words that
 * name the fix.
 */
export function PriceTable({
  template,
  rows,
  onChange,
  errors,
  showErrors,
  flagged = [],
}: {
  template: ProductTemplate;
  rows: DraftRow[];
  onChange: (rows: DraftRow[]) => void;
  errors: Record<string, string>;
  showErrors: boolean;
  /** Options GRIDGO's price check flagged on a saved product. */
  flagged?: string[];
}) {
  const colors = useThemeColors();
  const labels = new Map(template.options.map((o) => [o.key, o.label]));
  const unit = unitLabel(template.unit);

  function patch(key: string, next: Partial<DraftRow>) {
    onChange(rows.map((r) => (r.optionKey === key ? { ...r, ...next } : r)));
  }

  return (
    <View className="gap-2">
      {rows.map((row) => {
        const label = labels.get(row.optionKey) ?? row.optionKey;
        const error = showErrors ? errors[row.optionKey] : undefined;
        const unusual = !error && (outsideUsualRange(template, row) || flagged.includes(row.optionKey));
        return (
          <View
            key={row.optionKey}
            className={[
              "rounded-card border bg-surface p-3",
              error ? "border-error" : row.on ? "border-outline" : "border-outline-subtle",
            ].join(" ")}
            testID={`price-row-${row.optionKey}`}
          >
            <Pressable
              onPress={() => patch(row.optionKey, { on: !row.on })}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: row.on }}
              accessibilityLabel={`I make ${label}`}
              className="gg-touch flex-row items-center gap-3"
            >
              <View
                className={[
                  "h-6 w-6 items-center justify-center rounded-md border-2",
                  row.on ? "border-accent bg-accent" : "border-outline bg-surface",
                ].join(" ")}
              >
                {row.on ? <Check size={16} color={colors.accentOn} strokeWidth={3} aria-hidden /> : null}
              </View>
              <Text
                className={row.on ? "min-w-0 flex-1 text-body text-text-primary" : "min-w-0 flex-1 text-body text-text-muted"}
              >
                {label}
              </Text>
            </Pressable>
            {row.on ? (
              <View className="mt-2 flex-row items-center gap-3">
                <View className="flex-1">
                  <MoneyField
                    value={row.price}
                    onChange={(price) => patch(row.optionKey, { price })}
                    accessibilityLabel={`Full price for ${label}, ${unit}`}
                    placeholder="Full price"
                  />
                </View>
                <Text className="w-20 text-caption text-text-muted">{unit}</Text>
              </View>
            ) : null}
            {error ? (
              <Text className="mt-2 text-caption text-error" accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : unusual ? (
              <Text className="mt-2 text-caption text-text-secondary">
                Unusual for this product. The GRIDGO team checks it before it goes live.
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
