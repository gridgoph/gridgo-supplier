import { Text, View } from "react-native";

import { CoverageGlyph } from "@/components/CoverageGlyph";
import { StatusChip } from "@/components/StatusChip";
import { bpsPercent, movedPages, tierLabel, type ColourQuote } from "@/lib/colourPricing";
import { formatPhp } from "@/lib/money";
import { changeNotice, changeStatusLabel, type ChangeRequest } from "@/lib/orderChanges";

type Props = {
  request: ChangeRequest;
  /** The job's other requests, oldest first, said in one line each. */
  earlier?: ChangeRequest[];
  /** The line's colour reading as GRIDGO measured it, for "was" beside each corrected page. */
  originalColour?: ColourQuote | null;
};

/**
 * The job's change request and where it stands.
 *
 * The change itself is the substance, so it is set where the eye lands after
 * the chip, with the client's note it answers muted above it. The reason is the
 * shop's own words, repeated so it can see what the client read.
 */
export function ChangeRequestPanel({ request, earlier = [], originalColour = null }: Props) {
  const notice = changeNotice(request);
  return (
    <View className="gg-card gap-3" testID="change-request">
      <View className="flex-row">
        <StatusChip tone={notice.chip.tone} label={notice.chip.label} icon={notice.chip.icon} wrap />
      </View>
      <View className="gap-1">
        <Text className="text-body-lg font-medium text-text-primary">{notice.title}</Text>
        <Text className="text-body text-text-secondary">{notice.body}</Text>
      </View>
      <View className="gap-2 rounded-field border border-outline bg-surface-variant p-3">
        {request.originalInstructions ? (
          <View className="gap-0.5">
            <Text className="text-caption text-text-muted">The client asked</Text>
            <Text className="text-body text-text-secondary">{request.originalInstructions}</Text>
          </View>
        ) : null}
        {request.proposedSpec ? (
          <View className="gap-0.5">
            <Text className="text-caption text-text-muted">Your change</Text>
            <Text className="text-body font-medium text-text-primary">{request.proposedSpec}</Text>
          </View>
        ) : null}
        {request.colourCorrection ? (
          <View className="gap-1">
            <Text className="text-caption text-text-muted">Your corrected colour pages</Text>
            <ColourCorrectionPages correction={request.colourCorrection} original={originalColour} />
          </View>
        ) : null}
      </View>
      {notice.money ? <Text className="text-body text-text-primary">{notice.money}</Text> : null}
      {request.reason ? (
        <View className="gap-0.5">
          <Text className="text-caption text-text-muted">Your reason, as the client read it</Text>
          <Text className="text-body text-text-secondary">{request.reason}</Text>
        </View>
      ) : null}
      {earlier.length ? (
        <View className="gap-1 border-t border-outline-subtle pt-3">
          <Text className="text-caption text-text-muted">Earlier requests on this job</Text>
          {earlier.map((row) => (
            <Text key={row.id} className="text-body text-text-secondary">
              {changeStatusLabel(row)}:{" "}
              {row.proposedSpec || (row.colourCorrection ? "corrected colour prices" : "a new time")}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The pages a colour correction moved, each with what GRIDGO measured beside
 * it. The pages that kept GRIDGO's reading are said in one line.
 */
function ColourCorrectionPages({ correction, original }: { correction: ColourQuote; original: ColourQuote | null }) {
  const limit = original?.a3LimitBps ?? correction.a3LimitBps;
  const before = new Map((original?.pages ?? []).map((page) => [`${page.fileId}:${page.page}`, page]));
  const moved = movedPages(original, correction);
  const same = correction.pages.length - moved.length;
  return (
    <View className="gap-2">
      {moved.map((page) => {
        const was = before.get(`${page.fileId}:${page.page}`);
        return (
          <View key={`${page.fileId}:${page.page}`} className="flex-row items-start gap-2">
            <CoverageGlyph bps={page.strongColourBps} size="sm" />
            <View className="min-w-0 flex-1">
              <Text className="text-body font-medium text-text-primary">
                Page {page.page}: {bpsPercent(page.strongColourBps)} strong colour
                {page.tier ? `, ${tierLabel(page.tier, limit)}` : ""}
                {page.sheetPriceMinor != null ? `, ${formatPhp(page.sheetPriceMinor)} a sheet` : ""}
              </Text>
              {was ? (
                <Text className="text-caption text-text-muted">
                  GRIDGO measured {bpsPercent(was.strongColourBps)}
                  {was.sheetPriceMinor != null ? `, ${formatPhp(was.sheetPriceMinor)} a sheet` : ""}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
      {same && moved.length ? (
        <Text className="text-caption text-text-muted">
          {same === 1 ? "1 other page keeps" : `${same} other pages keep`} GRIDGO&apos;s reading and price.
        </Text>
      ) : null}
      {!moved.length ? <Text className="text-caption text-text-muted">Every page keeps GRIDGO&apos;s reading.</Text> : null}
    </View>
  );
}
