import { Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { StarterChoice } from "@/components/StarterChoice";
import { SkeletonBlock } from "@/components/Skeleton";
import { OptionList } from "@/components/controls/OptionList";
import { ListingSection } from "@/components/listing/ListingSection";
import { PrinterCapField } from "@/components/listing/PrinterCapField";
import { needsPrinterCap, type BoardTarget, type ListingStarter } from "@/lib/listings";

export const BLANK_STARTER = "__blank__";

type Props = {
  targets: BoardTarget[];
  categoryCode: string | null;
  subcategoryCode: string | null;
  printerMaxWidthFeet: number | null;
  starterId: string;
  starters: ListingStarter[];
  startersLoading: boolean;
  starterError: string | null;
  created: boolean;
  onCategory: (code: string) => void;
  onSubcategory: (code: string) => void;
  onPrinterCap: (feet: number | null) => void;
  onStarter: (id: string) => void;
  onRetryStarters: () => void;
};

export function PickStep({
  targets,
  categoryCode,
  subcategoryCode,
  printerMaxWidthFeet,
  starterId,
  starters,
  startersLoading,
  starterError,
  created,
  onCategory,
  onSubcategory,
  onPrinterCap,
  onStarter,
  onRetryStarters,
}: Props) {
  const target = targets.find((entry) => entry.category.code === categoryCode) ?? null;

  return (
    <View>
      {targets.length > 1 ? (
        <ListingSection title="WHICH OF YOUR CATEGORIES">
          <OptionList
            options={targets.map((entry) => ({
              value: entry.category.code,
              label: entry.category.name,
              detail: entry.category.bestFor,
            }))}
            value={categoryCode}
            onChange={onCategory}
            accessibilityLabel="Which category this listing sits under"
          />
        </ListingSection>
      ) : null}

      {target ? (
        <ListingSection title="WHAT KIND OF WORK">
          <OptionList
            options={target.covers.map((cover) => ({
              value: cover.code,
              label: cover.name,
              detail: cover.examples,
            }))}
            value={subcategoryCode}
            onChange={onSubcategory}
            accessibilityLabel="What kind of work this listing is"
          />
        </ListingSection>
      ) : null}

      {subcategoryCode && needsPrinterCap(subcategoryCode) ? (
        <ListingSection title="MAX PRINTER WIDTH">
          <PrinterCapField value={printerMaxWidthFeet} onChange={onPrinterCap} />
        </ListingSection>
      ) : null}

      {subcategoryCode && !created ? (
        <ListingSection title="WHERE TO START">
          {startersLoading ? (
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Loading GRIDGO starters"
              className="gap-2"
            >
              <SkeletonBlock className="h-24 w-full rounded-field" />
              <SkeletonBlock className="h-16 w-full rounded-field" />
            </View>
          ) : (
            <StarterChoice
              starters={starters}
              value={starterId}
              blankValue={BLANK_STARTER}
              onChange={onStarter}
            />
          )}
          {starterError ? (
            <ErrorNotice message={starterError} onRetry={onRetryStarters} />
          ) : null}
          {starters.length ? (
            <Text className="text-caption text-text-muted">
              A starter is copied into your listing. Rename, reprice or delete anything in it
              afterwards — it stays yours.
            </Text>
          ) : null}
        </ListingSection>
      ) : null}
    </View>
  );
}
