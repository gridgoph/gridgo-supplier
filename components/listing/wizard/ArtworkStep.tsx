import { Link2 } from "lucide-react-native";
import { Text, View } from "react-native";

import { ChipMultiSelect } from "@/components/ChipMultiSelect";
import { FormatPlusField } from "@/components/FormatPlusField";
import { AddPrepStepButton, PrepStepRow } from "@/components/PrepStepEditor";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { ListingSection } from "@/components/listing/ListingSection";
import { fileFormatName, linkFormatInvitation, type PublishedFileFormat } from "@/data/fileFormats";
import { LISTING_CAPS, type BoardContext, type PrepStep } from "@/lib/listings";
import { PREP_STEPS_NOT_OPEN_YET } from "@/lib/listingsApi";
import { linkFileOptions, uploadedFileOptions } from "@/lib/fileFormatResolve";
import type { ListingDraft } from "@/lib/listingDraft";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  working: ListingDraft;
  context: BoardContext;
  formats: readonly PublishedFileFormat[];
  prepSteps: PrepStep[];
  prepStepsOpen: boolean;
  busy: boolean;
  onChange: (next: ListingDraft) => void;
  onReload: () => void;
  onAddPrep: (input: { title: string; body: string }) => Promise<boolean>;
  onRemovePrep: (stepId: string) => void;
  onMovePrep: (from: number, to: number) => void;
};

export function ArtworkStep({
  working,
  context,
  formats,
  prepSteps,
  prepStepsOpen,
  busy,
  onChange,
  onReload,
  onAddPrep,
  onRemovePrep,
  onMovePrep,
}: Props) {
  return (
    <>
      <ListingSection
        title="BEFORE THEY ORDER"
        hint="What a client should do before sending work. Numbered — they read it in order."
      >
        {!prepStepsOpen ? (
          <View className="gg-panel gap-2">
            <Text className="text-body text-text-secondary">{PREP_STEPS_NOT_OPEN_YET}</Text>
            <SecondaryButton label="Check again" onPress={onReload} />
          </View>
        ) : (
          <>
            {prepSteps.map((step, index) => (
              <PrepStepRow
                key={step.id}
                step={step}
                position={index + 1}
                busy={busy}
                onRemove={() => onRemovePrep(step.id)}
                onMoveUp={index === 0 ? undefined : () => onMovePrep(index, index - 1)}
                onMoveDown={
                  index === prepSteps.length - 1 ? undefined : () => onMovePrep(index, index + 1)
                }
              />
            ))}
            {prepSteps.length === 0 ? (
              <Text className="text-body text-text-secondary">
                Nothing yet. On specialised work this is where a job is won or lost — flatten
                the art, outline the fonts, export the 3MF at the right scale.
              </Text>
            ) : null}
            {prepSteps.length < LISTING_CAPS.prepSteps ? (
              <AddPrepStepButton busy={busy} onAdd={onAddPrep} />
            ) : (
              <Text className="text-caption text-text-muted">
                That is all eight steps. Remove one before adding another.
              </Text>
            )}
          </>
        )}
      </ListingSection>

      <ListingSection
        title="ARTWORK YOU ACCEPT"
        hint="What a client may send you for this listing."
      >
        <SegmentedControl
          options={[
            { value: "inherit", label: "Same as your category" },
            { value: "override", label: "Just this listing" },
          ]}
          value={working.fileFormatMode}
          onChange={(value) => onChange({ ...working, fileFormatMode: value })}
          accessibilityLabel="Which artwork this listing accepts"
        />
        {working.fileFormatMode === "override" ? (
          <View className="gap-5">
            <View className="gap-2">
              <Text className="text-caption text-text-muted">Files they upload</Text>
              <ChipMultiSelect
                options={uploadedFileOptions(formats, working.formatCodes).map((format) => ({
                  value: format.code,
                  label: format.name,
                }))}
                selected={working.formatCodes}
                onToggle={(code) => onChange({ ...working, formatCodes: toggle(working.formatCodes, code) })}
                accessibilityLabel="Files this listing accepts"
                trailing={
                  <FormatPlusField
                    formats={formats}
                    selected={working.formatCodes}
                    onSelect={(code) =>
                      onChange({
                        ...working,
                        formatCodes: working.formatCodes.includes(code)
                          ? working.formatCodes
                          : [...working.formatCodes, code],
                      })
                    }
                    disabled={busy}
                  />
                }
              />
            </View>
            <View className="gap-2">
              <View className="flex-row items-center gap-2">
                <LinkGlyph />
                <Text className="text-caption text-text-muted">Links you accept</Text>
              </View>
              <ChipMultiSelect
                options={linkFileOptions(formats).map((format) => ({
                  value: format.code,
                  label: format.name,
                  accessibilityLabel: linkFormatInvitation(format.code, formats),
                }))}
                selected={working.formatCodes}
                onToggle={(code) => onChange({ ...working, formatCodes: toggle(working.formatCodes, code) })}
                accessibilityLabel="Links this listing accepts"
              />
              <Text className="text-caption text-text-muted">
                Tick Canva and a client can paste a Canva link on this listing instead of
                exporting a file.
              </Text>
            </View>
          </View>
        ) : (
          <Text className="text-caption text-text-muted">
            {context.inheritedFormatCodes.length
              ? context.inheritedFormatCodes.map((code) => fileFormatName(code, formats)).join(", ")
              : "Your category has no artwork set yet. Choose it here, or set it once in Services you offer."}
          </Text>
        )}
      </ListingSection>
    </>
  );
}

function LinkGlyph() {
  const colors = useThemeColors();
  return <Link2 size={13} color={colors.textMuted} strokeWidth={2} />;
}

function toggle(codes: string[], code: string): string[] {
  return codes.includes(code) ? codes.filter((entry) => entry !== code) : [...codes, code];
}
