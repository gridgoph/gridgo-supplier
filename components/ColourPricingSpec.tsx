import { TriangleAlert } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { CoverageGlyph } from "@/components/CoverageGlyph";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { formatTimelineAt } from "@/lib/dates";
import { formatPhp } from "@/lib/money";
import {
  bpsPercent,
  quantityModeLabel,
  sheetsLine,
  tierLabel,
  type ColourLine,
  type ColourPage,
  type ColourQuote,
} from "@/lib/colourPricing";

/** Long documents start folded so the rest of the job stays in reach. */
const FOLDED_PAGES = 12;

/**
 * Each page's strong colour, tier and the shop's own sheet price on one line,
 * as GRIDGO measured it at checkout (gridgo-api `docs/COLOUR_PRICING_API.md`,
 * "Operations, order evidence and corrections").
 *
 * Frozen with the order: it is the evidence in a price dispute, and a later
 * setting, listing or file change never rewrites it. A correction the client
 * agreed to is drawn under the original, never in its place. A one-colour
 * service shows the reading too, without prices, because it is what the
 * client's colour warning was based on.
 */
export function ColourPricingSpec({ line }: { line: ColourLine }) {
  const { quote, agreed } = line;
  const priced = quote.pricedByColour;
  return (
    <View className="gap-3 border-t border-outline-subtle pt-3" testID="colour-pricing-spec">
      <View className="flex-row items-start gap-2">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body font-medium text-text-primary">
            {priced ? `${quote.paperSize ?? "Paper"}, priced by strong colour` : "One colour service, fixed price"}
          </Text>
          <Text className="text-body text-text-secondary">
            {sheetsLine(quote.quantityMode, quote.quantity, quote.pages.length)}
          </Text>
          {quote.quantityMode ? (
            <Text className="text-caption text-text-muted">{quantityModeLabel(quote.quantityMode)}</Text>
          ) : null}
        </View>
        <StatusChip tone="info" icon="circle-help" label="Estimate" />
      </View>

      {quote.warning ? (
        <View className="flex-row gap-2 rounded-field border border-warning p-3">
          <WarningIcon />
          <Text className="min-w-0 flex-1 text-body text-text-primary">
            The client was told: “{quote.warning}”
          </Text>
        </View>
      ) : null}

      <PageList quote={quote} />
      {priced ? <LineTotal label="Your line total" minor={quote.lineSubtotalMinor} /> : null}

      {agreed ? (
        <View className="gap-2 border-t border-outline-subtle pt-3">
          <Text className="text-body font-medium text-text-primary">
            Corrected by you, agreed by the client
            {agreed.appliedAt ? ` ${formatTimelineAt(agreed.appliedAt)}` : ""}
          </Text>
          <Text className="text-caption text-text-muted">
            Print these pages at the corrected prices. The reading above stays as GRIDGO measured it.
          </Text>
          <PageList quote={{ ...agreed, a3LimitBps: quote.a3LimitBps, tierSet: quote.tierSet }} />
          <LineTotal label="Corrected line total" minor={agreed.correctedLineSubtotalMinor} />
        </View>
      ) : null}

      <Text className="text-caption text-text-muted">
        Strong colour is the share of the whole sheet, margins included, in saturated colour, measured on the paper and
        layout the client chose. Saved with the order as price evidence. If a page is clearly in another tier, send a
        colour correction for the client to approve instead of printing at a different price.
      </Text>
    </View>
  );
}

function PageList({ quote }: { quote: ColourQuote }) {
  const [open, setOpen] = useState(false);
  const rows = open ? quote.pages : quote.pages.slice(0, FOLDED_PAGES);
  const files = [...new Set(quote.pages.map((page) => page.fileId))];
  return (
    <View className="gap-1">
      <View className="rounded-field border border-outline-subtle">
        {rows.map((page, index) => (
          <PageRow
            key={`${page.fileId}:${page.page}`}
            page={page}
            first={index === 0}
            priced={quote.pricedByColour}
            a3LimitBps={quote.a3LimitBps}
            fileNumber={files.length > 1 ? files.indexOf(page.fileId) + 1 : 0}
          />
        ))}
      </View>
      {quote.pages.length > FOLDED_PAGES ? (
        <Pressable
          onPress={() => setOpen((current) => !current)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          className="gg-touch justify-center self-start"
        >
          <Text className="text-body font-medium text-text-primary">
            {open ? "Show fewer pages" : `Show all ${quote.pages.length} pages`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PageRow({
  page,
  first,
  priced,
  a3LimitBps,
  fileNumber,
}: {
  page: ColourPage;
  first: boolean;
  priced: boolean;
  a3LimitBps: number;
  /** Pages are numbered within their file; 0 when the line has one file. */
  fileNumber: number;
}) {
  const missing = priced && page.sheetPriceMinor == null;
  const tier = priced ? (page.tier ? tierLabel(page.tier, a3LimitBps) : "No tier on this paper") : null;
  return (
    <View
      testID="colour-page-row"
      accessibilityLabel={[
        `Page ${page.page}${fileNumber ? ` of file ${fileNumber}` : ""}`,
        `${bpsPercent(page.strongColourBps)} strong colour`,
        tier,
        priced ? (missing ? "Needs a price check" : formatPhp(page.sheetPriceMinor ?? 0)) : null,
      ]
        .filter(Boolean)
        .join(", ")}
      className={
        first
          ? "flex-row items-center gap-3 px-3 py-2"
          : "flex-row items-center gap-3 border-t border-outline-subtle px-3 py-2"
      }
    >
      <CoverageGlyph bps={page.strongColourBps} size="sm" />
      <View className="min-w-0 flex-1">
        <Text className="text-body text-text-primary">
          Page {page.page}
          {fileNumber ? <Text className="text-caption text-text-muted">{`  File ${fileNumber}`}</Text> : null}
        </Text>
        {tier ? <Text className="text-caption text-text-muted">{tier}</Text> : null}
      </View>
      <View className="items-end">
        <Text className="text-body text-text-primary">{bpsPercent(page.strongColourBps)}</Text>
        {priced ? (
          missing ? (
            <View className="flex-row items-center gap-1">
              <WarningIcon size={14} />
              <Text className="text-caption font-medium text-text-primary">Price check</Text>
            </View>
          ) : (
            <Text className="text-caption text-text-secondary">{formatPhp(page.sheetPriceMinor ?? 0)} a sheet</Text>
          )
        ) : null}
      </View>
    </View>
  );
}

function LineTotal({ label, minor }: { label: string; minor: number | null }) {
  return (
    <View className="flex-row items-center justify-between rounded-field bg-surface-variant px-3 py-2">
      <Text className="text-body text-text-secondary">{label}</Text>
      <Text className="text-body font-medium text-text-primary">
        {minor == null ? "Needs a price check" : formatPhp(minor)}
      </Text>
    </View>
  );
}

function WarningIcon({ size = 16 }: { size?: number }) {
  const colors = useThemeColors();
  return (
    <View className="pt-0.5">
      <TriangleAlert size={size} color={colors.warning} strokeWidth={2} />
    </View>
  );
}

