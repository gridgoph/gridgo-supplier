import { Check, CircleHelp, Scaling, Scissors, type LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";

import { PrintLayoutDiagram } from "@/components/PrintLayoutDiagram";
import { SpecRow } from "@/components/SpecRow";
import type { ColorToken } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";
import type { ProductionItem } from "@/lib/api";
import { printLayoutFacts, readPrintLayoutCheck, type LayoutFactTone } from "@/lib/printLayout";

const TONE: Record<LayoutFactTone, { Icon: LucideIcon; color: ColorToken }> = {
  cut_off: { Icon: Scissors, color: "warning" },
  scaled: { Icon: Scaling, color: "info" },
  fits: { Icon: Check, color: "success" },
  unread: { Icon: CircleHelp, color: "textMuted" },
};

/**
 * The client's print layout, as part of the agreed spec of one item.
 *
 * Rows for the layout, the paper and the client's page, then GRIDGO's check
 * in the shop's words beside a picture of the page on the paper. Draws
 * nothing for a line without a layout.
 */
export function PrintLayoutSpec({ item }: { item: Pick<ProductionItem, "printLayout" | "printLayoutCheck"> }) {
  const colors = useThemeColors();
  const facts = printLayoutFacts(item);
  if (!facts) return null;
  const check = readPrintLayoutCheck(item.printLayoutCheck);
  const page = check?.files.find((file) => file.page)?.page ?? null;
  const paper = check?.paper;
  const drawable =
    paper?.widthMilli && paper.heightMilli && page
      ? {
          paper: { width: paper.widthMilli, height: paper.heightMilli },
          page: { width: page.largestShortSideMilli, height: page.largestLongSideMilli },
        }
      : null;

  return (
    <View>
      {facts.rows.map((row) => (
        <SpecRow key={row.label} label={row.label} value={row.value} muted={row.muted} />
      ))}
      {facts.notes.length ? (
        <View className="flex-row gap-4 pb-2 pt-3">
          {drawable ? (
            <PrintLayoutDiagram
              layout={facts.layout}
              paper={drawable.paper}
              page={drawable.page}
              width={72}
              height={96}
            />
          ) : null}
          <View className="min-w-0 flex-1 gap-2">
            {facts.notes.map((note) => {
              const { Icon, color } = TONE[note.tone];
              return (
                <View key={note.text} className="flex-row gap-2">
                  <View className="pt-0.5">
                    <Icon size={16} color={colors[color]} strokeWidth={2} />
                  </View>
                  <Text className="min-w-0 flex-1 text-body text-text-primary">{note.text}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}
