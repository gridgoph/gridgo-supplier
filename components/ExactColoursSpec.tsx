import { CircleCheck, FileQuestion, Info } from "lucide-react-native";
import { Text, View } from "react-native";

import { ColorChip, ColorDot } from "@/components/ColorChip";
import { useUploadedNames } from "@/hooks/useUploadedNames";
import { useThemeColors } from "@/hooks/useTheme";
import type { ProductionItem } from "@/lib/api";
import { itemAttachments } from "@/lib/artworkAttachments";
import {
  artworkColorDetail,
  artworkColorLabel,
  artworkColorsOf,
  artworkColorsView,
  colorFileNamer,
  colorTargetsOf,
  SCREEN_PRINT_NOTE,
  swatchNote,
  targetFoundIn,
  type ArtworkColorsEntry,
} from "@/lib/colorTargets";

/** Enough to compare against a handful of brand colours without a wall of chips. */
const SHOWN = 8;

/**
 * The client's exact colours, as part of the agreed spec of one item: each
 * colour's label, its value as text and a chip that says how far its swatch
 * can be trusted, then the colours GRIDGO read from each released file so the
 * shop can hold one against the other. A target a file states exactly is
 * marked with the file's name. Draws nothing for an item without colours.
 */
export function ExactColoursSpec({ item }: { item: ProductionItem }) {
  const colors = useThemeColors();
  const targets = colorTargetsOf(item);
  const read = artworkColorsOf(item);
  const names = useUploadedNames(targets.length ? read.map((entry) => entry.fileId) : []);
  if (!targets.length) return null;

  const files = itemAttachments(item).flatMap((entry) => (entry.kind === "file" ? [{ fileId: entry.fileId, label: entry.label }] : []));
  const fileName = colorFileNamer(files, (fileId) => names[fileId]);

  return (
    <View className="gap-3 pb-1 pt-3" testID="exact-colours">
      <Text className="text-body text-text-secondary">Exact colours</Text>
      <View>
        {targets.map((target, index) => {
          const note = swatchNote(target);
          const found = targetFoundIn(target, read);
          const foundLine = found.length ? `In ${found.map(fileName).join(", ")}` : null;
          return (
            <View
              key={`${index}:${target.label}:${target.value}`}
              className={index === 0 ? "flex-row items-center gap-3 pb-3" : "flex-row items-center gap-3 border-t border-outline-subtle py-3"}
              accessible
              accessibilityLabel={[target.label, target.value, note, foundLine].filter(Boolean).join(". ")}
            >
              <ColorChip target={target} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-body font-medium text-text-primary">{target.label}</Text>
                <Text className="text-body text-text-primary" selectable>
                  {target.value}
                </Text>
                <Text className="text-caption text-text-muted">{note}</Text>
                {foundLine ? (
                  <View className="flex-row items-center gap-1.5">
                    <CircleCheck size={14} color={colors.success} strokeWidth={2} aria-hidden />
                    <Text className="min-w-0 flex-1 text-caption text-text-secondary" numberOfLines={2}>
                      {foundLine}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {read.length ? (
        <View className="gap-3 rounded-field bg-surface-variant p-3">
          <Text className="text-caption text-text-muted">Colours GRIDGO read from the files</Text>
          {read.map((entry) => (
            <FileColours key={entry.fileId} entry={entry} name={fileName(entry.fileId)} />
          ))}
        </View>
      ) : null}

      <View className="flex-row items-start gap-2" accessible accessibilityLabel={SCREEN_PRINT_NOTE}>
        <View className="pt-0.5">
          <Info size={14} color={colors.info} strokeWidth={2} aria-hidden />
        </View>
        <Text className="min-w-0 flex-1 text-caption text-text-secondary">{SCREEN_PRINT_NOTE}</Text>
      </View>
    </View>
  );
}

/**
 * One file's colours: spot colours by name, the rest by their own values. A
 * file whose colours could not be read says so in a sentence rather than
 * showing an empty palette, and a partly read file says what was left out.
 */
function FileColours({ entry, name }: { entry: ArtworkColorsEntry; name: string }) {
  const colors = useThemeColors();
  const view = artworkColorsView(entry.colors);
  return (
    <View className="gap-2">
      <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
        {name}
      </Text>
      {view.kind === "unknown" ? (
        <View className="flex-row items-start gap-2" accessible accessibilityLabel={[view.headline, ...view.notes].join(". ")}>
          <View className="pt-0.5">
            <FileQuestion size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-body text-text-secondary">{view.headline}.</Text>
            {view.notes.map((note) => (
              <Text key={note} className="text-caption text-text-muted">
                {note}
              </Text>
            ))}
          </View>
        </View>
      ) : (
        <>
          <View className="flex-row flex-wrap gap-2">
            {view.colors.slice(0, SHOWN).map((color, index) => {
              const label = artworkColorLabel(color);
              const detail = artworkColorDetail(color);
              return (
                <View
                  key={`${index}:${label}`}
                  className="flex-row items-center gap-2 rounded-pill border border-outline bg-surface py-1 pl-1.5 pr-3"
                  accessible
                  accessibilityLabel={`${label}, ${detail}`}
                >
                  <ColorDot hex={color.hex} size={20} />
                  <View>
                    <Text className="text-caption font-medium text-text-primary" selectable>
                      {label}
                    </Text>
                    <Text className="text-caption text-text-muted">{detail}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          {view.colors.length > SHOWN ? (
            <Text className="text-caption text-text-muted">And {view.colors.length - SHOWN} more in this file.</Text>
          ) : null}
          {view.notes.map((note) => (
            <Text key={note} className="text-caption text-text-muted">
              {note}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}
