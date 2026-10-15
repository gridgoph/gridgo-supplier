import { Image } from "expo-image";
import { Download, FileImage, FileText, Star } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { DesignLinkRow } from "@/components/DesignLinks";
import { SkeletonBlock } from "@/components/Skeleton";
import { useOpenArtwork } from "@/hooks/useOpenArtwork";
import { useSignedLink } from "@/hooks/useSignedLink";
import { useThemeColors } from "@/hooks/useTheme";
import { getFile, type Order, type StoredFile } from "@/lib/api";
import { attachmentCountLine, attachmentGroups, type AttachmentEntry, type AttachmentGroup } from "@/lib/artworkAttachments";
import { describeArtwork, isArtworkImage, isOrderArtwork } from "@/lib/orderArtwork";
import { rememberLink } from "@/lib/signedLinks";

/**
 * Every file and design link the client sent, one card per item, in the
 * client's order (`lib/artworkAttachments.ts`).
 *
 * The main file leads its own row with a preview, because it is the one the
 * shop prints from first; every other file is a row of its name, type and
 * size. A row is one tap: a file opens at full size to save or print, a link
 * opens at its host.
 */
export function ArtworkAttachments({ order }: { order: Order }) {
  const groups = attachmentGroups(order);
  const showItem = (order.productionItems?.length ?? 0) > 1;
  const hasLinks = groups.some((group) => group.entries.some((entry) => entry.kind === "link"));
  return (
    <View className="gap-4" testID="artwork-attachments">
      {groups.map((group) => (
        <AttachmentCard key={group.itemId} orderId={order.id} group={group} showItem={showItem} />
      ))}
      {hasLinks ? (
        <Text className="text-caption text-text-muted">
          If a design link asks you to sign in or will not open, ask Operations.
        </Text>
      ) : null}
    </View>
  );
}

function AttachmentCard({ orderId, group, showItem }: { orderId: string; group: AttachmentGroup; showItem: boolean }) {
  // Naming a main file is only news when there is another file to tell it from.
  const markMain = group.entries.filter((entry) => entry.kind === "file").length > 1;
  return (
    <View className="gap-2">
      {showItem ? (
        <View className="flex-row flex-wrap items-baseline justify-between gap-x-3">
          <Text className="text-body font-medium text-text-primary">{group.itemName}</Text>
          <Text className="text-caption text-text-muted">{attachmentCountLine(group.entries)}</Text>
        </View>
      ) : null}
      <View className="gg-card-flush">
        {group.entries.map((entry, index) =>
          entry.kind === "file" ? (
            <AttachmentFileRow key={`file:${entry.fileId}`} orderId={orderId} entry={entry} first={index === 0} markMain={markMain} />
          ) : (
            <DesignLinkRow key={`link:${entry.link.url}`} link={entry.link} first={index === 0} />
          ),
        )}
      </View>
    </View>
  );
}

type FileLoad =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; file: StoredFile };

type FileEntry = Extract<AttachmentEntry, { kind: "file" }>;

function AttachmentFileRow({ orderId, entry, first, markMain }: { orderId: string; entry: FileEntry; first: boolean; markMain: boolean }) {
  const colors = useThemeColors();
  const { fileId, label, main } = entry;
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<FileLoad>({ kind: "loading" });
  const { open, opening, openError, clearOpenError } = useOpenArtwork(fileId);

  // The order arrived with a signed link: keep it, so the preview draws without asking again.
  rememberLink(fileId, entry.downloadUrl, entry.downloadUrlExpiresAt);

  useEffect(() => {
    let current = true;
    getFile(fileId).then(
      (file) => {
        // Only this job's production artwork; never a receipt or private evidence.
        if (current) setLoad(isOrderArtwork(file, orderId, "artwork") ? { kind: "ready", file } : { kind: "error" });
      },
      () => {
        if (current) setLoad({ kind: "error" });
      },
    );
    return () => { current = false; };
  }, [fileId, orderId, attempt]);

  const file = load.kind === "ready" ? load.file : null;
  const image = Boolean(file && isArtworkImage(file));
  const preview = useSignedLink(fileId, main && image);
  const name = file?.originalFilename ?? null;
  const title = label ?? name ?? (load.kind === "error" ? "File could not load" : "Loading file…");

  function retry() {
    setLoad({ kind: "loading" });
    clearOpenError();
    setAttempt((value) => value + 1);
  }

  return (
    <View className={first ? "" : "border-t border-outline-subtle"} testID={`attachment-${fileId}`}>
      {main && (load.kind === "loading" || image) ? (
        <View className="h-44 items-center justify-center bg-surface-variant">
          {preview.uri ? (
            <Image
              testID="attachment-preview-image"
              source={{ uri: preview.uri }}
              // Third-party Image does not receive NativeWind's RN import transform.
              style={{ width: "100%", height: "100%" }}
              contentFit="contain"
              cachePolicy="none"
              transition={0}
              accessibilityLabel={`Main file: ${name ?? title}`}
              onLoad={preview.onLoad}
              onError={preview.onError}
            />
          ) : preview.failed ? (
            <View className="items-center gap-2 px-4">
              <FileImage size={32} color={colors.textMuted} />
              <Text className="text-center text-body text-text-secondary">Preview unavailable. Download the file to see it.</Text>
            </View>
          ) : (
            <SkeletonBlock className="h-full w-full" />
          )}
        </View>
      ) : null}
      <View className="px-3 py-2">
        <Pressable
          onPress={() => void open()}
          disabled={!file || opening}
          accessibilityRole="button"
          accessibilityLabel={`Download ${[label, name].filter(Boolean).join(", ") || "file"}${main && markMain ? ", main file" : ""}`}
          accessibilityHint="Opens the file at full size, to save or print"
          accessibilityState={{ disabled: !file || opening, busy: opening }}
          className="gg-touch min-w-0 flex-row items-center gap-3 rounded-field py-1"
        >
          {({ pressed }) => (
            <>
              <View className="h-10 w-10 items-center justify-center rounded-field bg-surface-variant">
                {image ? <FileImage size={20} color={colors.textPrimary} strokeWidth={2} /> : <FileText size={20} color={colors.textPrimary} strokeWidth={2} />}
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
                  <Text className="shrink text-body font-medium text-text-primary" numberOfLines={2}>{title}</Text>
                  {main && markMain ? <MainFileMark /> : null}
                </View>
                {label && name ? (
                  <Text className="text-caption text-text-secondary" numberOfLines={1} ellipsizeMode="middle">{name}</Text>
                ) : null}
                {file ? (
                  <Text className="text-caption text-text-muted">{opening ? "Opening…" : describeArtwork(file)}</Text>
                ) : load.kind === "loading" ? (
                  <SkeletonBlock className="h-3 w-24" />
                ) : null}
              </View>
              {file ? <Download size={20} color={colors.textPrimary} strokeWidth={2} /> : null}
              {pressed && file ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
            </>
          )}
        </Pressable>
        {load.kind === "error" ? (
          <View className="gap-2 pb-1">
            <Text accessibilityRole="alert" className="text-caption text-error">
              This file could not load. Retry, or ask Operations to check file access.
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Retry ${label ?? "file"}`} onPress={retry} className="gg-btn-secondary">
              <Text className="text-button text-text-primary">Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {openError ? <Text accessibilityRole="alert" className="pb-1 text-caption text-error">{openError}</Text> : null}
      </View>
    </View>
  );
}

/** The first file on the line: the one GRIDGO counts pages from and previews. */
function MainFileMark() {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-1 rounded-pill border border-outline px-2" testID="main-file-mark">
      <Star size={12} color={colors.textPrimary} fill={colors.textPrimary} strokeWidth={2} />
      <Text className="text-caption font-medium text-text-primary">Main file</Text>
    </View>
  );
}
