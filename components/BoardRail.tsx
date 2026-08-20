import type { ReactNode } from "react";
import { ArrowUpDown, LayoutGrid, List, Plus } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { SelectField } from "@/components/controls/SelectField";
import type { CatalogueView } from "@/hooks/useCatalogueView";
import { useThemeColors } from "@/hooks/useTheme";
import {
  ON_BOARD_OPTIONS,
  sortLabel,
  type CatalogueSort,
  type KindOption,
  type OnBoardFilter,
} from "@/lib/catalogueBoard";

type Props = {
  count: number;
  view: CatalogueView;
  onViewChange: (view: CatalogueView) => void;
  kinds: KindOption[];
  kind: string;
  onPickKind: () => void;
  onBoard: OnBoardFilter;
  onOnBoardChange: (value: OnBoardFilter) => void;
  sort: CatalogueSort;
  onPickSort: () => void;
  onAdd: () => void;
};

/**
 * How the shop hunts its board: kind of work, on the board or not, then sort.
 *
 * Kind, standing and sort share one filter row. Overlines and full-width
 * fields stacked four deep; the closed select is a chip with a chevron, same
 * height as All / On the board / Hidden. The plus stays the one yellow action.
 */
export function BoardRail({
  count,
  view,
  onViewChange,
  kinds,
  kind,
  onPickKind,
  onBoard,
  onOnBoardChange,
  sort,
  onPickSort,
  onAdd,
}: Props) {
  const colors = useThemeColors();
  const kindLabel = kind === "all" ? "All work" : (kinds.find((entry) => entry.code === kind)?.name ?? "All work");

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text className="text-overline text-text-muted">LISTINGS</Text>
          <View className="min-w-5 items-center rounded-pill bg-surface-variant px-1.5">
            <Text className="text-caption font-medium text-text-secondary">{count}</Text>
          </View>
        </View>

        <View
          className="flex-row rounded-field border border-outline bg-surface-variant p-1"
          accessibilityRole="radiogroup"
          accessibilityLabel="How to show listings"
        >
          <ViewButton
            selected={view === "wall"}
            label="Show as a wall"
            onPress={() => onViewChange("wall")}
          >
            <LayoutGrid
              size={18}
              color={view === "wall" ? colors.textPrimary : colors.textMuted}
              strokeWidth={2}
            />
          </ViewButton>
          <ViewButton
            selected={view === "list"}
            label="Show as a list"
            onPress={() => onViewChange("list")}
          >
            <List
              size={18}
              color={view === "list" ? colors.textPrimary : colors.textMuted}
              strokeWidth={2}
            />
          </ViewButton>
        </View>

        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add a listing"
          className="gg-btn-primary w-11 px-0"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <Plus size={20} color={colors.actionYellowOn} strokeWidth={2} />
        </Pressable>
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        {kinds.length > 1 ? (
          <SelectField
            label="Kind of work"
            valueLabel={kindLabel}
            accessibilityLabel={`Kind of work, ${kindLabel}`}
            onPress={onPickKind}
            density="chip"
          />
        ) : null}

        <View
          className="flex-row flex-wrap items-center gap-2"
          accessibilityRole="radiogroup"
          accessibilityLabel="On the board or hidden"
        >
          {ON_BOARD_OPTIONS.map((option) => {
            const selected = onBoard === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => onOnBoardChange(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                className={
                  selected
                    ? "gg-touch items-center justify-center rounded-pill border border-outline bg-surface-high px-3"
                    : "gg-touch items-center justify-center rounded-pill border border-outline bg-surface px-3"
                }
                style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
              >
                <Text
                  numberOfLines={1}
                  className={
                    selected
                      ? "text-caption font-medium text-text-primary"
                      : "text-caption text-text-secondary"
                  }
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SelectField
          label="Sort"
          valueLabel={`Sort: ${sortLabel(sort)}`}
          accessibilityLabel={`Sort: ${sortLabel(sort)}`}
          onPress={onPickSort}
          density="chip"
          icon={ArrowUpDown}
        />
      </View>
    </View>
  );
}

function ViewButton({
  selected,
  label,
  onPress,
  children,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className={
        selected
          ? "h-11 w-11 items-center justify-center rounded-sm border border-outline bg-surface-high"
          : "h-11 w-11 items-center justify-center rounded-sm"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {children}
    </Pressable>
  );
}
