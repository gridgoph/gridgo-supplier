import { Text, View } from "react-native";

import { BookPreview } from "@/components/BookPreview";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { useOpenArtwork } from "@/hooks/useOpenArtwork";
import type { ProductionItem } from "@/lib/api";
import { agreedCoverSpine, coverSpineRows, spineLines } from "@/lib/coverSpine";

/**
 * The hardbound cover and spine the client agreed, as part of one item's
 * agreed spec: how the cover is made, each line of the spine, and the book
 * drawn the way the client saw it. A separate cover page opens from here.
 * Draws nothing for a line whose product does not ask, or an older order.
 */
export function CoverSpineSpec({ item }: { item: Pick<ProductionItem, "coverSpine"> }) {
  const record = agreedCoverSpine(item);
  if (!record) return null;
  return (
    <View testID="cover-spine-spec">
      {coverSpineRows(record).map((row) => (
        <SpecRow key={row.label} label={row.label} value={row.value} muted={row.muted} />
      ))}
      {record.status === "given" ? (
        <View className="gap-3 pt-3">
          <BookPreview cover={record.cover} lines={spineLines(record)} />
          {record.coverFileId ? <CoverFileButton fileId={record.coverFileId} /> : null}
          <Text className="text-caption text-text-muted">
            The client&apos;s preview, not a template. Size the boards and spine to the page count.
          </Text>
        </View>
      ) : (
        <Text className="pt-3 text-caption text-text-muted">
          The client gave no cover or spine details. Ask Operations before you make the cover.
        </Text>
      )}
    </View>
  );
}

function CoverFileButton({ fileId }: { fileId: string }) {
  const { open, opening, openError } = useOpenArtwork(fileId);
  return (
    <View className="gap-1">
      <SecondaryButton
        label={opening ? "Opening the cover page…" : "Open the cover page"}
        onPress={() => void open()}
        disabled={opening}
      />
      {openError ? <Text className="text-caption text-error">{openError}</Text> : null}
    </View>
  );
}
