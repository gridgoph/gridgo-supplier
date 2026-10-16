import { FileCheck, FileWarning, ImageOff, Paperclip, RotateCcw, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";

import { SamplePhotoViewer } from "@/components/SamplePhotoViewer";
import { SkeletonBlock } from "@/components/Skeleton";
import { useSignedLink } from "@/hooks/useSignedLink";
import { useThemeColors } from "@/hooks/useTheme";
import { getFile, type StoredFile } from "@/lib/api";
import { isProofImage, proofDocumentKind, uploadStageLabel, type UploadItem } from "@/lib/files";

/**
 * A payout part's evidence as a contact sheet: every file GRIDGO lists for it,
 * in the order it was first filed, each drawn once.
 *
 * GRIDGO already lists a picture once however many times it was uploaded
 * (gridgo-api `docs/OPERATIONAL_MODEL_V2_API.md#payout-proofs`), so the
 * sheet draws `pofFileIds` as they come and never adds the shop's own pending
 * uploads to it — a photo is either on file here or waiting in the queue
 * below, never both.
 *
 * Plain rounded plates, like the progress photos: these are pictures of a job
 * on the floor, not print samples. A tap opens the loupe.
 */

const GAP = 8;
const COLUMNS = 3;

type SheetProps = {
  fileIds: string[];
  /** What each picture is, for anyone who cannot see it ("Start of production evidence"). */
  label: string;
  /** Bumped by the screen when the phone comes back, so tiles read their links again. */
  reloadVersion?: number;
};

/** Every proof on file, wrapped three across. The page around it scrolls. */
export function ProofPhotoGrid({ fileIds, label, reloadVersion = 0 }: SheetProps) {
  const [width, setWidth] = useState(0);
  const size = width > 0 ? Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS) : 0;
  return (
    <View
      testID="proof-grid"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityRole="list"
      accessibilityLabel={proofCountLabel(fileIds.length)}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}
    >
      {size > 0
        ? fileIds.map((fileId, index) => (
            <ProofTile
              key={`${fileId}:${reloadVersion}`}
              fileId={fileId}
              size={size}
              alt={`${label} ${index + 1} of ${fileIds.length}`}
            />
          ))
        : null}
    </View>
  );
}

/** The same files as one scrolling row, for a job screen that has other things to say. */
export function ProofPhotoStrip({ fileIds, label, reloadVersion = 0 }: SheetProps) {
  if (!fileIds.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: GAP }}
      accessibilityRole="list"
      accessibilityLabel={proofCountLabel(fileIds.length)}
    >
      {fileIds.map((fileId, index) => (
        <ProofTile
          key={`${fileId}:${reloadVersion}`}
          fileId={fileId}
          size={80}
          alt={`${label} ${index + 1} of ${fileIds.length}`}
        />
      ))}
    </ScrollView>
  );
}

/** "1 photo on file", "12 photos on file". */
export function proofCountLabel(count: number): string {
  return `${count} ${count === 1 ? "photo" : "photos"} on file`;
}

function ProofTile({ fileId, size, alt }: { fileId: string; size: number; alt: string }) {
  const colors = useThemeColors();
  const [file, setFile] = useState<StoredFile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void getFile(fileId).then(
      (value) => {
        if (active) setFile(value);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [fileId]);

  const document = file
    ? { fileName: file.originalFilename, mimeType: file.detectedContentType || file.declaredContentType }
    : null;
  const picture = Boolean(document && isProofImage(document));

  return (
    <View
      testID="proof-tile"
      className="overflow-hidden rounded-field border border-outline bg-surface-variant"
      style={{ width: size, height: size }}
    >
      {failed ? (
        <Unavailable alt={alt} />
      ) : !document ? (
        <SkeletonBlock className="h-full w-full" />
      ) : picture ? (
        <ProofPicture fileId={fileId} alt={alt} />
      ) : (
        <View
          className="flex-1 items-center justify-center gap-1 p-2"
          accessible
          accessibilityLabel={`${alt}, ${proofDocumentKind(document)} ${document.fileName}`}
        >
          <FileCheck size={20} color={colors.success} strokeWidth={2} />
          <Text className="text-caption font-medium text-text-primary">{proofDocumentKind(document)}</Text>
          <Text className="text-center text-caption text-text-secondary" numberOfLines={1}>
            {document.fileName}
          </Text>
        </View>
      )}
    </View>
  );
}

function ProofPicture({ fileId, alt }: { fileId: string; alt: string }) {
  const link = useSignedLink(fileId);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  if (link.failed) return <Unavailable alt={alt} />;
  if (!link.uri) return <SkeletonBlock className="h-full w-full" />;
  return (
    <Pressable
      onPress={() => setOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${alt} larger`}
      style={{ width: "100%", height: "100%" }}
    >
      {loaded ? null : (
        <View pointerEvents="none" className="absolute inset-0">
          <SkeletonBlock className="h-full w-full" />
        </View>
      )}
      <Image
        testID="proof-tile-image"
        source={{ uri: link.uri }}
        accessibilityLabel={alt}
        resizeMode="cover"
        style={{ width: "100%", height: "100%" }}
        onLoad={() => {
          setLoaded(true);
          link.onLoad();
        }}
        onError={link.onError}
      />
      {open ? <SamplePhotoViewer uri={link.uri} alt={alt} open={open} onClose={() => setOpen(false)} /> : null}
    </Pressable>
  );
}

function Unavailable({ alt }: { alt: string }) {
  const colors = useThemeColors();
  return (
    <View
      className="flex-1 items-center justify-center gap-1 p-2"
      accessible
      accessibilityLabel={`${alt}, will not load`}
    >
      <ImageOff size={18} color={colors.textMuted} strokeWidth={2} />
      <Text className="text-center text-caption text-text-muted">Will not load</Text>
    </View>
  );
}

type QueueProps = {
  items: UploadItem[];
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
};

/**
 * Photos on their way, one row each: its own picture, its own progress and
 * its own reason when it fails. A failed photo keeps its place and its retry;
 * the rest carry on.
 */
export function ProofQueue({ items, onRetry, onRemove }: QueueProps) {
  const colors = useThemeColors();
  if (!items.length) return null;
  return (
    <View className="gap-2" accessibilityRole="list">
      {items.map((item) => {
        const photograph = isProofImage(item) && Boolean(item.uri);
        const failed = item.stage === "failed" || Boolean(item.error);
        const moving = item.stage === "uploading" || item.stage === "processing";
        return (
          <View
            key={item.key}
            testID="proof-queue-item"
            className="flex-row items-center gap-3 rounded-field border border-outline bg-surface p-2"
          >
            <View className="h-14 w-14 items-center justify-center overflow-hidden rounded-field bg-surface-variant">
              {photograph ? (
                <Image
                  source={{ uri: item.uri }}
                  accessibilityLabel={item.fileName}
                  resizeMode="cover"
                  style={{ width: "100%", height: "100%" }}
                />
              ) : failed ? (
                <FileWarning size={20} color={colors.error} strokeWidth={2} />
              ) : (
                <Paperclip size={20} color={colors.textMuted} strokeWidth={2} />
              )}
            </View>

            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-body text-text-primary" numberOfLines={1}>
                {item.fileName}
              </Text>
              <Text
                className={
                  failed
                    ? "text-caption text-error"
                    : item.stage === "stored"
                      ? "text-caption text-success"
                      : "text-caption text-text-muted"
                }
              >
                {item.error ?? uploadStageLabel(item)}
              </Text>
              {item.stage === "uploading" ? (
                <View
                  className="h-1 w-full overflow-hidden rounded-pill bg-outline"
                  accessibilityRole="progressbar"
                  accessibilityLabel={`Sending ${item.fileName}`}
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(item.progress * 100) }}
                >
                  <View
                    className="h-1 rounded-pill bg-accent"
                    style={{ width: `${Math.max(2, Math.round(item.progress * 100))}%` }}
                  />
                </View>
              ) : null}
            </View>

            {item.stage === "failed" && item.uri ? (
              <Pressable
                onPress={() => onRetry(item.key)}
                accessibilityRole="button"
                accessibilityLabel={`Send ${item.fileName} again`}
                className="gg-touch items-center justify-center"
              >
                <RotateCcw size={20} color={colors.textPrimary} strokeWidth={2} />
              </Pressable>
            ) : null}
            {moving ? null : (
              <Pressable
                onPress={() => onRemove(item.key)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.fileName}`}
                className="gg-touch items-center justify-center"
              >
                <Trash2 size={20} color={colors.textMuted} strokeWidth={2} />
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}
