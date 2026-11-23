import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { FieldShell } from "@/components/controls/FieldShell";
import { MoneyField } from "@/components/controls/MoneyField";
import { NoteField } from "@/components/controls/NoteField";
import { singleLineFieldTextStyle } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";
import { moreOptionsCount, type MoreOptionsDraft } from "@/lib/productTemplates";

/**
 * Everything a product can have but most do not: folded until asked for.
 *
 * A shop adding its first product should see three questions, not ten, so
 * bulk discount, minimum order, rush and tips sit behind one row that says how
 * many are set. Extras and the shop's own photos are not fields — they are
 * their own screens once the product exists (`afterSave`), because both go
 * through the GRIDGO team's full photo and option review.
 */
export function MoreOptions({
  value,
  onChange,
  afterSave,
  defaultTips,
}: {
  value: MoreOptionsDraft;
  onChange: (next: MoreOptionsDraft) => void;
  /** Rows for extras and own photos, drawn once the product is saved. */
  afterSave?: ReactNode;
  /** GRIDGO's own tips for this product, shown when the shop has none of its own. */
  defaultTips?: string[];
}) {
  const colors = useThemeColors();
  const count = moreOptionsCount(value);
  const [open, setOpen] = useState(count > 0);
  const set = (patch: Partial<MoreOptionsDraft>) => onChange({ ...value, ...patch });

  return (
    <View className="gg-card-flush">
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`More options${count ? `, ${count} set` : ""}`}
        className="gg-touch flex-row items-center gap-3 px-4 py-3"
        testID="more-options-toggle"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-body font-medium text-text-primary">More options</Text>
          <Text className="text-caption text-text-muted">
            {count ? `${count} set` : "Bulk discount, minimum order, rush, extras, photos, tips"}
          </Text>
        </View>
        {open ? <ChevronUp size={20} color={colors.textMuted} aria-hidden /> : <ChevronDown size={20} color={colors.textMuted} aria-hidden />}
      </Pressable>

      {open ? (
        <View className="gap-5 border-t border-outline-subtle px-4 pb-4 pt-4">
          <FieldShell label="Bulk discount" hint="A lower price each when a client orders many. Leave empty for none.">
            <View className="flex-row items-center gap-2">
              <Text className="text-body text-text-secondary">From</Text>
              <View className="w-20">
                <CountInput value={value.bulkFrom} onChange={(bulkFrom) => set({ bulkFrom })} label="Bulk discount starts at, pieces" />
              </View>
              <Text className="text-body text-text-secondary">pcs,</Text>
              <View className="flex-1">
                <MoneyField value={value.bulkPrice} onChange={(bulkPrice) => set({ bulkPrice })} accessibilityLabel="Bulk price each" placeholder="each" />
              </View>
            </View>
          </FieldShell>

          <FieldShell label="Minimum order" hint="The fewest you will take. Leave empty for any amount.">
            <View className="w-28">
              <CountInput value={value.minimumOrder} onChange={(minimumOrder) => set({ minimumOrder })} label="Minimum order" />
            </View>
          </FieldShell>

          <FieldShell label="Rush" hint="Faster than your ready time, for an extra fee. Leave empty for no rush.">
            <View className="flex-row items-center gap-2">
              <Text className="text-body text-text-secondary">In</Text>
              <View className="w-20">
                <CountInput value={value.rushHours} onChange={(rushHours) => set({ rushHours })} label="Rush, hours" />
              </View>
              <Text className="text-body text-text-secondary">hours, +</Text>
              <View className="flex-1">
                <MoneyField value={value.rushFee} onChange={(rushFee) => set({ rushFee })} accessibilityLabel="Rush fee" placeholder="fee" />
              </View>
            </View>
          </FieldShell>

          <FieldShell
            label="Tips for the client"
            hint={defaultTips?.length ? `Empty uses GRIDGO's: “${defaultTips[0]}”` : "What a client should know before sending work."}
          >
            <NoteField value={value.tips} onChange={(tips) => set({ tips })} placeholder="Example: send a PDF with 3 mm bleed" accessibilityLabel="Tips for the client" maxLength={2000} />
          </FieldShell>

          {afterSave ?? (
            <Text className="text-caption text-text-muted">
              Extras and your own photos come next, once the product is saved.
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** A whole-number count, typed. */
function CountInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const colors = useThemeColors();
  return (
    <View className="gg-field justify-center px-3">
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^\d]/g, "").slice(0, 6))}
        keyboardType="number-pad"
        inputMode="numeric"
        accessibilityLabel={label}
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        className="text-body text-text-primary"
        style={singleLineFieldTextStyle}
      />
    </View>
  );
}
