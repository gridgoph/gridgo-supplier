import { Text, View } from "react-native";
import { FileText, MessageSquareText, Package, User } from "lucide-react-native";

import { useThemeColors } from "@/hooks/useTheme";
import {
  bundleHint,
  bundleLine,
  expressBundles,
  printChips,
  rangeLine,
  type ExpressPrint,
  type ExpressView,
} from "@/lib/expressOrder";

type Props = { view: ExpressView };

/**
 * What to print, one row per file: the settings as chips a printer reads at a
 * glance, in the order the print dialog asks for them, and the client's note
 * under its own file. The files themselves open from the job's docket.
 *
 * A group order is split into one card per person, under the name GRIDGO
 * sends, so each bundle is packed and labelled on its own. An ordinary order
 * is one card, as before.
 */
export function ExpressPrintList({ view }: Props) {
  const bundles = expressBundles(view);
  if (!view.prints.length) return null;
  if (!bundles) {
    return (
      <View className="gg-card gap-0 py-1" testID="express-print-list">
        <PrintRows prints={view.prints} />
      </View>
    );
  }
  return (
    <View className="gap-3" testID="express-print-list">
      <PackHint text={bundleHint(view)} />
      {bundles.map((bundle, index) => (
        <View key={bundle.member.id} className="gg-card gap-0 py-1" testID="express-bundle">
          <BundleHeader
            name={bundle.member.name}
            line={bundleLine(bundle)}
            position={`${index + 1} of ${bundles.length}`}
          />
          <PrintRows prints={bundle.prints} divided />
        </View>
      ))}
    </View>
  );
}

function PackHint({ text }: { text: string }) {
  const colors = useThemeColors();
  return (
    <View className="gg-panel flex-row gap-3" testID="express-pack-hint">
      <Package size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">Pack each person separately</Text>
        <Text className="text-body text-text-secondary">{text}</Text>
      </View>
    </View>
  );
}

function BundleHeader({ name, line, position }: { name: string; line: string; position: string }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-3 py-3">
      <View className="h-9 w-9 items-center justify-center rounded-pill bg-surface-variant">
        <User size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-body-lg font-medium text-text-primary" numberOfLines={2} testID="express-bundle-name">
          {name}
        </Text>
        <Text className="text-caption text-text-secondary">{line}</Text>
      </View>
      <Text className="text-caption text-text-muted" accessibilityLabel={`Bundle ${position}`}>
        {position}
      </Text>
    </View>
  );
}

function PrintRows({ prints, divided = false }: { prints: ExpressPrint[]; divided?: boolean }) {
  const colors = useThemeColors();
  return (
    <>
      {prints.map((print, index) => {
        const range = rangeLine(print);
        return (
          <View
            key={`${print.fileId ?? "file"}-${index}`}
            className={index || divided ? "gap-2 border-t border-outline-subtle py-3" : "gap-2 py-3"}
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
    </>
  );
}
