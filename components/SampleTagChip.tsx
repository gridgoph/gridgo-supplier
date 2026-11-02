import { FlaskConical, Layers } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { SAMPLE_TAG_LABEL, type SampleTag } from "@/lib/sampleFirst";

/**
 * "Sample" or "Batch from sample" on a job (`lib/sampleFirst.ts`).
 *
 * A tag like Express, not a status: the neutral outline, with the meaning in
 * the icon and the word, so it reads in greyscale and never borrows the
 * yellow of the screen's one action.
 */
export function SampleTagChip({ tag }: { tag: SampleTag }) {
  const colors = useThemeColors();
  const Icon = tag === "sample" ? FlaskConical : Layers;
  return (
    <View className="gg-chip" accessibilityRole="text" testID={`sample-tag-${tag}`}>
      <Icon size={13} color={colors.info} strokeWidth={2} />
      <Text className="text-caption text-text-primary">{SAMPLE_TAG_LABEL[tag]}</Text>
    </View>
  );
}
