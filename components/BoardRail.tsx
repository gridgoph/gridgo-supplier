import { useState, type ReactNode } from "react";
import { ArrowUpDown, LayoutGrid, List, Plus, SlidersHorizontal } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";

import { BoardHuntField } from "@/components/BoardHuntField";
import { SelectField } from "@/components/controls/SelectField";
import { motion } from "@/constants/theme";
import type { CatalogueView } from "@/hooks/useCatalogueView";
import { useThemeColors } from "@/hooks/useTheme";
import {
  ON_BOARD_OPTIONS,
  narrowingCount,
  sortLabel,
  type BoardQuery,
  type KindOption,
  type OnBoardFilter,
} from "@/lib/catalogueBoard";

type Props = {
  /** How many listings match, across every page. */
  count: number;
  view: CatalogueView;
  onViewChange: (view: CatalogueView) => void;
  kinds: KindOption[];
  query: BoardQuery;
  onHunt: (value: string) => void;
  onPickKind: () => void;
  onOnBoardChange: (value: OnBoardFilter) => void;
  onPickSort: () => void;
  onAdd: () => void;
};

/**
 * How the shop hunts its board: find a sample, then cut what comes back.
 *
 * The rail carries three things and, while a hunt is running, only two of them.
 * That is the deliberate move here. Hunting and filtering are the same job done
 * at different scales, and a shop that has typed "tarp" is not also reading
 * four filter chips — so kind, standing and sort fold into one chip, and the
 * chip keeps the count of how many are still narrowing the wall. That count is
 * the whole reason it is a chip and not a word: a shop hunting with Hidden
 * still selected finds nothing and would otherwise have no way to see why.
 *
 * What never folds is the count and the wall/list toggle — those describe the
 * result, and the result is what the shop is looking at. The plus stays the one
 * yellow control on the screen.
 */
export function BoardRail({
  count,
  view,
  onViewChange,
  kinds,
  query,
  onHunt,
  onPickKind,
  onOnBoardChange,
  onPickSort,
  onAdd,
}: Props) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const [typing, setTyping] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const narrowing = narrowingCount(query);
  const hunting = typing || query.q.length > 0;
  const folded = hunting && !filtersOpen;
  const kindLabel =
    query.kind === "all"
      ? "All work"
      : (kinds.find((entry) => entry.code === query.kind)?.name ?? "All work");
  const fade = reduceMotion ? undefined : FadeIn.duration(motion.fast);

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        {/*
          The eyebrow and the badge are one fact, so they are one thing to a
          screen reader: "LISTINGS" then "12" is two announcements that mean
          nothing apart, and the count is the answer to the hunt.
        */}
        <View
          accessible
          accessibilityLabel={
            hunting
              ? `${count} ${count === 1 ? "listing matches" : "listings match"} your hunt`
              : `${count} ${count === 1 ? "listing" : "listings"} on your board`
          }
          className="min-w-0 flex-1 flex-row items-center gap-2"
        >
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

      <BoardHuntField value={query.q} onHunt={onHunt} onFocusChange={setTyping} />

      {folded ? (
        <Animated.View key="folded" entering={fade} className="flex-row">
          <FiltersChip
            narrowing={narrowing}
            open={false}
            onPress={() => setFiltersOpen(true)}
          />
        </Animated.View>
      ) : (
        <Animated.View key="open" entering={fade} className="flex-row flex-wrap items-center gap-2">
          {hunting ? (
            <FiltersChip
              narrowing={narrowing}
              open
              onPress={() => setFiltersOpen(false)}
            />
          ) : null}

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
              const selected = query.onBoard === option.value;
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
            valueLabel={`Sort: ${sortLabel(query.sort)}`}
            accessibilityLabel={`Sort: ${sortLabel(query.sort)}`}
            onPress={onPickSort}
            density="chip"
            icon={ArrowUpDown}
          />
        </Animated.View>
      )}
    </View>
  );
}

/**
 * The three standing filters, as one control while the shop is hunting.
 *
 * It carries the number that are actually narrowing the wall, because that
 * number is the answer to the only question a folded filter row raises.
 */
function FiltersChip({
  narrowing,
  open,
  onPress,
}: {
  narrowing: number;
  open: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const label = narrowing > 0 ? `Filters · ${narrowing}` : "Filters";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={
        narrowing > 0
          ? `Filters, ${narrowing} narrowing your board`
          : "Filters"
      }
      className={
        open
          ? "gg-touch max-w-full flex-row items-center gap-1.5 rounded-pill border border-outline bg-surface-high px-3"
          : "gg-touch max-w-full flex-row items-center gap-1.5 rounded-pill border border-outline bg-surface px-3"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <SlidersHorizontal size={14} color={colors.textMuted} strokeWidth={2} />
      <Text numberOfLines={1} className="shrink text-caption font-medium text-text-primary">
        {label}
      </Text>
    </Pressable>
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
