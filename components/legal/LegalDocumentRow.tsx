import { router } from "expo-router";
import { ChevronRight, FileText } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import type { LegalVersion } from "@/lib/api";
import { changeNote, legalDocumentHref, legalStatusLook, versionLine } from "@/lib/legal";

/**
 * One document as a way in: its title, which version this is, whether it is
 * still placeholder text, and — the one clause that moves a shop's money —
 * whether this version allows late-production deductions. Sits in a
 * `gg-card-flush` list; `divided` draws the hairline above every row but the
 * first.
 */
export function LegalDocumentRow({
  doc,
  divided = false,
  showChange = false,
}: {
  doc: LegalVersion;
  divided?: boolean;
  /** Under the version, what changed — on the agreement screen. */
  showChange?: boolean;
}) {
  const colors = useThemeColors();
  const look = legalStatusLook(doc);
  const change = showChange ? changeNote(doc) : null;
  return (
    <Pressable
      onPress={() => router.push(legalDocumentHref(doc))}
      accessibilityRole="button"
      accessibilityLabel={`Read the ${doc.title}`}
      accessibilityHint={[
        versionLine(doc),
        look.label,
        doc.penalties ? "Includes late-production deductions" : null,
      ]
        .filter(Boolean)
        .join(". ")}
      className={
        divided
          ? "gg-touch flex-row items-center gap-3 border-t border-outline-subtle px-4 py-3"
          : "gg-touch flex-row items-center gap-3 px-4 py-3"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
        <FileText size={20} color={colors.textPrimary} aria-hidden />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-body-lg font-medium text-text-primary">{doc.title}</Text>
        <Text className="text-caption text-text-muted">{versionLine(doc)}</Text>
        {change ? <Text className="text-caption text-text-secondary">{change}</Text> : null}
        <View className="flex-row flex-wrap gap-2 pt-0.5">
          <StatusChip tone={look.tone} label={look.label} icon={look.icon} />
          {doc.penalties ? (
            <StatusChip tone="info" label="Late deductions" icon="banknote" />
          ) : null}
        </View>
      </View>
      <ChevronRight size={20} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}
