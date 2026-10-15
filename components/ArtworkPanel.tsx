import { Image } from "expo-image";
import { ExternalLink, FileImage, FileText } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ArtworkAttachments } from "@/components/ArtworkAttachments";
import { DesignLinks } from "@/components/DesignLinks";
import { SkeletonBlock } from "@/components/Skeleton";
import { useOpenArtwork } from "@/hooks/useOpenArtwork";
import { useSignedLink } from "@/hooks/useSignedLink";
import { useThemeColors } from "@/hooks/useTheme";
import { getFile, type Order, type StoredFile } from "@/lib/api";
import { attachmentGroups, showsAttachmentList } from "@/lib/artworkAttachments";
import { orderDesignLinks } from "@/lib/designLink";
import { describeArtwork, isArtworkImage, readOrderArtwork, orderArtwork, type ArtworkReference } from "@/lib/orderArtwork";
import { signedLink } from "@/lib/signedLinks";

type Props = {
  order: Order;
  /**
   * Which production files to draw. Everything by default; the job brief
   * splits the print files from the reference pictures into their own rows.
   */
  kinds?: ArtworkReference["kind"][];
};

/**
 * All production files, each with independent loading and recovery.
 *
 * Wherever print artwork is drawn, the client's design links are drawn with
 * it: a link is the artwork for a job that has no file, so the panel names it
 * plainly instead of falling through to "no print file".
 *
 * A job whose items carry several files or labelled ones draws them as
 * `ArtworkAttachments` instead: per item, in the client's order, main file
 * marked. A job of one file per item keeps the single card it always had.
 */
export function ArtworkPanel({ order, kinds }: Props) {
  const files = orderArtwork(order).filter((file) => !kinds || kinds.includes(file.kind));
  if ((!kinds || kinds.includes("artwork")) && showsAttachmentList(order)) {
    const listed = new Set(attachmentGroups(order).flatMap((group) =>
      group.entries.flatMap((entry) => (entry.kind === "file" ? [entry.fileId] : []))));
    // A file the order names outside its items, or a reference picture, keeps its own card.
    const rest = files.filter((file) => !(file.kind === "artwork" && listed.has(file.fileId)));
    return (
      <View className="gap-3">
        <ArtworkAttachments order={order} />
        {rest.map((file) => (
          <ArtworkFile key={`${order.id}:${file.fileId}`} orderId={order.id} reference={file} />
        ))}
      </View>
    );
  }
  const links = !kinds || kinds.includes("artwork") ? orderDesignLinks(order) : [];
  const showItem = (order.productionItems?.length ?? 0) > 1;
  if (!files.length && !links.length) {
    return <Text className="text-body text-text-secondary">{emptyCopy(order, kinds)}</Text>;
  }
  return (
    <View className="gap-3">
      {files.map((file) => (
        <ArtworkFile key={`${order.id}:${file.fileId}`} orderId={order.id} reference={file} />
      ))}
      {links.length ? (
        <View className="gap-2">
          <Text className="text-body text-text-secondary">
            {files.length
              ? `The client also sent ${links.length === 1 ? "a design link" : "design links"}.`
              : links.length === 1
                ? "The client sent the design as a link, not an uploaded file. Open it to get the artwork. If it asks you to sign in or will not open, ask Operations."
                : "The client sent the design as links, not uploaded files. Open each one to get the artwork. If one asks you to sign in or will not open, ask Operations."}
          </Text>
          <DesignLinks links={links} showItem={showItem} />
        </View>
      ) : null}
    </View>
  );
}

/** What an empty panel says, for the files it was asked to show. */
function emptyCopy(order: Order, kinds?: ArtworkReference["kind"][]): string {
  const onlyMockups = kinds?.length === 1 && kinds[0] === "mockup";
  if (onlyMockups) {
    return "The client did not attach a picture of how it should look. Go by the artwork and the specification.";
  }
  if (order.artworkName) {
    return `“${order.artworkName}” is recorded, but no stored file is available. Ask Operations for the production file.`;
  }
  return kinds?.length === 1 && kinds[0] === "artwork"
    ? "No print file is attached yet. Ask Operations for the production file."
    : "No artwork or reference picture is attached yet. Ask Operations for the production file.";
}

type FileState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; file: StoredFile; previewUrl: string | null };

/**
 * The preview's link, read fresh on every load and kept in the shared link
 * memory so `useSignedLink` draws it without a second request. It is asked for
 * only after `readOrderArtwork` has confirmed the file is this order's artwork.
 */
async function previewLink(fileId: string): Promise<{ url: string }> {
  const link = await signedLink(fileId, { force: true });
  if (!link) throw new Error("preview_link_refused");
  return link;
}

function ArtworkFile({ orderId, reference }: { orderId: string; reference: ArtworkReference }) {
  const colors = useThemeColors();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<FileState>({ kind: "loading" });
  const { fileId, kind } = reference;
  const { open, opening, openError, clearOpenError } = useOpenArtwork(fileId);

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const loaded = await readOrderArtwork({ fileId, kind }, orderId, { getFile, getDownloadUrl: previewLink });
        if (current) setState({ kind: "ready", ...loaded });
      } catch {
        if (current) setState({ kind: "error", message: "This attachment could not load. Retry, or ask Operations to check file access." });
      }
    }
    void load();
    return () => { current = false; };
  }, [fileId, orderId, kind, attempt]);

  function retry() {
    setState({ kind: "loading" });
    clearOpenError();
    setAttempt((value) => value + 1);
  }

  // The preview link lives five minutes and a job can sit open in the
  // background far longer: an expired link is read again once, and on resume,
  // rather than latching "Preview unavailable" behind a manual Retry.
  const preview = useSignedLink(fileId, state.kind === "ready" && Boolean(state.previewUrl));
  const previewFailed = preview.failed;
  const file = state.kind === "ready" ? state.file : null;
  const image = Boolean(file && isArtworkImage(file));
  return (
    <View className="overflow-hidden rounded-card border border-outline bg-surface">
      <View className="h-44 items-center justify-center bg-surface-variant">
        {state.kind === "loading" || (state.kind === "ready" && state.previewUrl && !preview.uri && !preview.failed) ? <SkeletonBlock /> : state.kind === "ready" && preview.uri ? (
          <Image
            testID="artwork-preview-image"
            source={{ uri: preview.uri }}
            // Third-party Image does not receive NativeWind's RN import transform.
            style={{ width: "100%", height: "100%" }}
            contentFit="contain"
            cachePolicy="none"
            transition={0}
            accessibilityLabel={`${kind === "mockup" ? "Reference mockup" : "Artwork"}: ${state.file.originalFilename}`}
            onLoad={preview.onLoad}
            onError={preview.onError}
          />
        ) : (
          <View className="items-center gap-2 px-4">
            {image ? <FileImage size={32} color={colors.textMuted} /> : <FileText size={32} color={colors.textMuted} />}
            <Text className="text-center text-body text-text-secondary">{state.kind === "error" ? "Attachment unavailable" : previewFailed ? "Preview unavailable" : "Open the original document to inspect it"}</Text>
          </View>
        )}
      </View>
      <View className="gap-2 p-3">
        {reference.itemName ? <Text className="text-body font-medium text-text-primary">{reference.itemName}</Text> : null}
        <Text className="text-overline text-text-muted">{kind === "mockup" ? "REFERENCE MOCKUP" : "ARTWORK"}</Text>
        <Text className="text-body font-medium text-text-primary">{file?.originalFilename ?? (state.kind === "error" ? "File could not load" : "Loading attachment…")}</Text>
        {file ? <Text className="text-caption text-text-muted">{describeArtwork(file)}</Text> : null}
        {state.kind === "error" ? <Text accessibilityRole="alert" className="text-body text-error">{state.message}</Text> : null}
        {openError ? <Text accessibilityRole="alert" className="text-body text-error">{openError}</Text> : null}
        {state.kind === "error" || previewFailed ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Retry attachment" onPress={retry} className="gg-btn-secondary">
            <Text className="text-button text-text-primary">Retry attachment</Text>
          </Pressable>
        ) : null}
        {file ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${file.originalFilename}`} accessibilityState={{ disabled: opening, busy: opening }} onPress={() => void open()} disabled={opening} className="gg-btn-secondary flex-row gap-2">
            <ExternalLink size={18} color={colors.textPrimary} />
            <Text className="text-button text-text-primary">{opening ? "Opening…" : "Open file"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
