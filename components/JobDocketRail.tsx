import { ChevronDown, Search, X } from "lucide-react-native";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import {
  JOB_SORTS,
  JOB_STAGE_TICKETS,
  isJobSort,
  jobBoardCountCopy,
  sortLabel,
  type JobBoardQuery,
  type JobStageFilter,
} from "@/lib/jobBoard";
import { askPick } from "@/store/sheets";

type Props = {
  query: JobBoardQuery;
  counts: Record<JobStageFilter, number>;
  shown: number;
  total: number;
  onChange: (query: JobBoardQuery) => void;
};

/**
 * The docket strip above the job list.
 *
 * Find, stamp, then sort — the same three questions the client orders list
 * asks, in the same order. Sort is a named control that opens the platform
 * sheet, not a row of words and not a segmented bar: the current order sits
 * next to the count, with a chevron, the way GRIDGO already teaches it.
 */
export function JobDocketRail({ query, counts, shown, total, onChange }: Props) {
  const colors = useThemeColors();
  const finding = query.q.length > 0;
  const currentSort = sortLabel(query.sort);

  async function pickSort() {
    const picked = await askPick({
      title: "Sort jobs",
      options: JOB_SORTS.map((entry) => ({
        value: entry.value,
        label: entry.label,
        detail: entry.detail,
      })),
      selected: query.sort,
    });
    if (!picked || !isJobSort(picked)) return;
    onChange({ ...query, sort: picked });
  }

  return (
    <View className="gap-3 pb-4">
      <View
        className={
          finding
            ? "h-12 flex-row items-center rounded-field border border-accent bg-surface pl-3"
            : "h-12 flex-row items-center rounded-field border border-outline bg-surface pl-3"
        }
      >
        <Search
          size={18}
          color={finding ? colors.textPrimary : colors.textMuted}
          strokeWidth={2}
        />
        <TextInput
          value={query.q}
          onChangeText={(q) => onChange({ ...query, q })}
          placeholder="Find a job"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Find a job by name"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          className="min-w-0 flex-1 text-body text-text-primary"
          style={FIELD_TEXT}
        />
        {finding ? (
          <Pressable
            onPress={() => onChange({ ...query, q: "" })}
            accessibilityRole="button"
            accessibilityLabel="Clear find"
            className="h-11 w-11 items-center justify-center"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <X size={18} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
        ) : (
          <View className="w-3" />
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="flex-row gap-2 pr-1"
      >
        {JOB_STAGE_TICKETS.map((ticket) => {
          const on = query.stage === ticket.value;
          const count = counts[ticket.value];
          const label = ticket.value === "all" ? ticket.label : `${ticket.label} ${count}`;
          return (
            <Pressable
              key={ticket.value}
              onPress={() => onChange({ ...query, stage: ticket.value })}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={
                ticket.value === "all"
                  ? `${ticket.label}, ${count} jobs`
                  : `${ticket.label}, ${count}`
              }
              className={
                on
                  ? "gg-chip gg-touch border-accent bg-accent px-3"
                  : "gg-chip gg-touch border-outline bg-surface px-3"
              }
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <Text
                className={on ? "text-caption text-accent-on" : "text-caption text-text-secondary"}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="flex-row items-center justify-between gap-3">
        <Text className="shrink text-caption text-text-muted" numberOfLines={1}>
          {jobBoardCountCopy(shown, total)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${currentSort.toLowerCase()}. Change the order.`}
          onPress={() => void pickSort()}
          className="gg-touch -mr-2 flex-row items-center gap-1 px-2"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <Text className="text-button text-text-primary">{currentSort}</Text>
          <ChevronDown
            size={16}
            color={colors.textPrimary}
            strokeWidth={2}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Pressable>
      </View>
    </View>
  );
}

const FIELD_TEXT = {
  paddingStart: 8,
  paddingEnd: 0,
  paddingVertical: 0,
  includeFontPadding: false,
  textAlignVertical: "center",
} as const;
