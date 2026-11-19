import { Text, View } from "react-native";
import { FileText, MessageSquareText } from "lucide-react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { printChips, rangeLine, type ExpressView } from "@/lib/expressOrder";

type Props = { view: ExpressView };

/**
 * What to print, one row per file: the settings as chips a printer reads at a
 * glance, in the order the print dialog asks for them, and the client's note
 * under its own file. The files themselves open from the job's docket.
 */
export function ExpressPrintList({ view }: Props) {
  const colors = useThemeColors();
  if (!view.prints.length) return null;
  return (
    <View className="gg-card gap-0 py-1" testID="express-print-list">
      {view.prints.map((print, index) => {
        const range = rangeLine(print);
        return (
          <View
            key={`${print.fileId ?? "file"}-${index}`}
            className={index ? "gap-2 border-t border-outline-subtle py-3" : "gap-2 py-3"}
          >
            <View className="flex-row items-center gap-2">
              <FileText size={18} color={colors.textPrimary} strokeWidth={2} />
              <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">
                File {index + 1}
                {range ? <Text className="text-body text-text-muted">{`  ${range}`}</Text> : null}
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-1.5">
              {printChips(print).map((chip) => (
                <View key={chip} className="rounded-pill bg-surface-variant px-2.5 py-1">
                  <Text className="text-caption font-medium text-text-primary">{chip}</Text>
                </View>
              ))}
            </View>
            {print.note ? (
              <View className="flex-row gap-2">
                <MessageSquareText size={16} color={colors.textMuted} strokeWidth={2} />
                <Text className="min-w-0 flex-1 text-body text-text-secondary">{print.note}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
