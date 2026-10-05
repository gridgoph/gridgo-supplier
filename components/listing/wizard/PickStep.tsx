import { Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { StarterChoice } from "@/components/StarterChoice";
import { SkeletonBlock } from "@/components/Skeleton";
import { ListingSection } from "@/components/listing/ListingSection";
import { PrinterCapField } from "@/components/listing/PrinterCapField";
import { ProductTypeGrid } from "@/components/listing/ProductTypeGrid";
import { IN_HOUSE_LISTING } from "@/lib/inHouse";
import { needsPrinterCap, type ListingStarter } from "@/lib/listings";
import type { ProductTypeChoice } from "@/lib/productTypes";

export const BLANK_STARTER = "__blank__";

type Props = {
  choices: ProductTypeChoice[];
  categoryNames: Record<string, string>;
  typesLoading: boolean;
  typesError: string | null;
  onRetryTypes: () => void;
  query: string;
  onQuery: (value: string) => void;
  subcategoryCode: string | null;
  printerMaxWidthFeet: number | null;
  starterId: string;
  starters: ListingStarter[];
  startersLoading: boolean;
  starterError: string | null;
  created: boolean;
  onType: (choice: ProductTypeChoice) => void;
  onRequestType: (name: string) => void;
  onPrinterCap: (feet: number | null) => void;
  onStarter: (id: string) => void;
  onRetryStarters: () => void;
};

/**
 * Pick: which product type this listing is, from a grid of real samples.
 *
 * Choosing a type files the listing under the shop's own category line for
 * it; it never claims the whole category or widens what the shop is
 * accredited for. Anything missing goes to Operations as a request.
 */
export function PickStep({
  choices,
  categoryNames,
  typesLoading,
  typesError,
  onRetryTypes,
  query,
  onQuery,
  subcategoryCode,
  printerMaxWidthFeet,
  starterId,
  starters,
  startersLoading,
  starterError,
  created,
  onType,
  onRequestType,
  onPrinterCap,
  onStarter,
  onRetryStarters,
}: Props) {
  return (
    <View>
      <ListingSection title="WHAT ARE YOU LISTING" hint={IN_HOUSE_LISTING}>
        {typesError ? <ErrorNotice message={typesError} onRetry={onRetryTypes} /> : null}
        <ProductTypeGrid
          choices={choices}
          categoryNames={categoryNames}
          loading={typesLoading}
          query={query}
          onQuery={onQuery}
          selected={subcategoryCode}
          onSelect={onType}
          onRequest={created ? undefined : onRequestType}
        />
      </ListingSection>

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
