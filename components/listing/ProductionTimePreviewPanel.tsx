import { CalendarDays } from "lucide-react-native";
import { Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip, type StatusIconName, type StatusTone } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { useProductionTimePreview } from "@/hooks/useProductionTimePreview";
import type { Listing } from "@/lib/listings";
import { BOARD_NOT_OPEN_YET } from "@/lib/listingsApi";
import type { ProductionChoice } from "@/lib/productionDays";
import {
  PREVIEW_STATUS_LABEL,
  previewDayDetail,
  previewDayLabel,
  previewSummary,
  type PreviewDay,
  type PreviewStatus,
} from "@/lib/productionTimePreview";

const STATUS_CHIP: Record<PreviewStatus, { tone: StatusTone; icon: StatusIconName }> = {
  secured: { tone: "success", icon: "circle-check" },
  tight: { tone: "warning", icon: "clock" },
  rush: { tone: "warning", icon: "zap" },
  not_possible: { tone: "neutral", icon: "ban" },
};

function DayRow({ day }: { day: PreviewDay }) {
  const detail = previewDayDetail(day);
  return (
    <View className="gap-1 rounded-field border border-outline px-3 py-2">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-body font-medium text-text-primary">{previewDayLabel(day.day)}</Text>
        <StatusChip {...STATUS_CHIP[day.status]} label={PREVIEW_STATUS_LABEL[day.status]} />
      </View>
      {detail ? <Text className="text-caption text-text-secondary">{detail}</Text> : null}
    </View>
  );
}

/**
 * "Dates clients will see": GRIDGO's own calendar for the answer on screen,
 * before it is saved, in the web dashboard's words. Each day is a status chip
 * (icon + label + colour) with its ready-by time or why it is not offered.
 * `problem` is the answer's own validation sentence; while there is one,
 * nothing is asked. While newer dates load, the last ones stay up dimmed.
 * GRIDGO counts the faster price options it holds, so `tiersUnsaved` says
 * that edited ones are not in the dates yet.
 */
export function ProductionTimePreviewPanel({
  listing,
  choice,
  problem,
  tiersUnsaved = false,
}: {
  listing: Listing;
  choice: ProductionChoice;
  problem: string | null;
  tiersUnsaved?: boolean;
}) {
  const colors = useThemeColors();
  const { outcome, updating, retry } = useProductionTimePreview(listing, problem ? null : choice);
  const preview = outcome?.status === "ok" ? outcome.value : null;

  return (
    <View className="gg-panel gap-3 p-3" accessibilityLiveRegion="polite">
      <View className="flex-row items-start gap-3">
        <CalendarDays size={18} color={colors.textSecondary} strokeWidth={2} />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body font-medium text-text-primary">Dates clients will see</Text>
          {problem ? (
            <Text className="text-caption text-text-muted">Fix the time above to see the dates.</Text>
          ) : outcome?.status === "not_open_yet" ? (
            <Text className="text-caption text-text-secondary">{BOARD_NOT_OPEN_YET}</Text>
          ) : preview ? (
            <Text className={`text-caption text-text-secondary ${updating ? "opacity-60" : ""}`}>
              {previewSummary(choice, preview)}
            </Text>
          ) : null}
          {!problem && tiersUnsaved ? (
            <Text className="text-caption text-text-muted">
              These dates use your saved faster price options. Save to see your changes in them.
            </Text>
          ) : null}
        </View>
      </View>

      {problem ? null : outcome?.status === "failed" ? (
        <ErrorNotice message={outcome.message} onRetry={updating ? undefined : retry} />
      ) : outcome == null ? (
        <View className="gap-2" accessibilityLabel="Loading the dates clients will see">
          <SkeletonBlock className="h-14 w-full rounded-field" />
          <SkeletonBlock className="h-14 w-full rounded-field" />
          <SkeletonBlock className="h-14 w-full rounded-field" />
        </View>
      ) : preview ? (
        <View
          className={`gap-2 ${updating ? "opacity-60" : ""}`}
          accessibilityLabel="The next two weeks"
          accessibilityState={{ busy: updating }}
        >
          {preview.days.map((day) => (
            <DayRow key={day.day} day={day} />
          ))}
        </View>
      ) : null}

      <Text className="text-caption text-text-muted">
        Counted from an order placed now, with GRIDGO&apos;s file check, your open days and the jobs already ahead of it.
        Tight dates fall between your shortest and longest time. It is a preview: nothing is reserved.
      </Text>
    </View>
  );
}
