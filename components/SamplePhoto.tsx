import { ImageOff, ImagePlus } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { CropMarkFrame } from "@/components/CropMarkFrame";
import { SamplePhotoViewer } from "@/components/SamplePhotoViewer";
import { SkeletonBlock } from "@/components/Skeleton";
import { useSignedLink } from "@/hooks/useSignedLink";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** A sample GRIDGO already holds. */
  fileId?: string | null;
  /**
   * Signed viewing link from this board read. Prefer this over asking again
   * for the same file — a wall of eight tiles would otherwise pay for eight
   * download-url round trips the list already made.
   */
  url?: string | null;
  /** A photo just picked on this phone, before it has been sent. */
  localUri?: string | null;
  /** What the sample shows, for anyone who cannot see it. */
  altText?: string | null;
  /** Square on the wall, wider on a preview header. */
  ratio?: "square" | "wide";
  gutter?: "tight" | "standard";
  /** What an empty frame says. A blank plate reads as a broken listing. */
  emptyLabel?: string;
  /**
   * Whether a press opens the loupe. A strip that is already a door
   * (Home's board card) must pass false — on web a button must not wrap a button.
   */
  enlarge?: boolean;
};

/**
 * One sample photo, in its crop-mark frame.
 *
 * GRIDGO hands out a short-lived signed link per view, so nothing here stores a
 * URL — only the file id GRIDGO gave us. A board read carries its own link
 * (`url`), and the screen holding that read renews it when the phone comes back
 * to the app (`hooks/usePhotoLinkRefresh.ts`). A photo drawn from its file id
 * alone — a filed proof, or a board link that was refused — asks
 * `hooks/useSignedLink.ts`, which renews an expired link once instead of
 * latching a failure and re-reads on resume.
 *
 * A photo that will not load on a good link says so in words. An empty grey
 * square on a board of samples reads as a listing with nothing on it. Waiting
 * on a link — the first or a fresh one — is the calm sweep, never the failure.
 *
 * A stored photo is a press: the tile stays the board, and the loupe is a
 * full-screen pinch so a shop can read the print rather than the thumbnail.
 */
export function SamplePhoto(props: Props) {
  // A replacement source owns fresh loading/error state before it is painted.
  return <PhotoFrame key={JSON.stringify([props.fileId, props.localUri, props.url])} {...props} />;
}

function PhotoFrame({
  fileId,
  url,
  localUri,
  altText,
  ratio = "square",
  gutter = "standard",
  emptyLabel,
  enlarge = true,
}: Props) {
  const colors = useThemeColors();
  // The photo on this phone first, then the board's link. Either can be
  // refused — a local preview the OS dropped, a board link that expired or
  // names a storage origin this phone cannot reach — and once GRIDGO holds
  // the file, a refusal falls back to asking for this file's own link.
  const direct = localUri ?? url ?? null;
  const [directRefused, setDirectRefused] = useState(false);
  const drawDirect = Boolean(direct) && !directRefused;
  const signed = useSignedLink(fileId, !drawDirect);
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const uri = drawDirect ? direct : signed.uri;
  const failed = drawDirect ? false : fileId ? signed.failed : directRefused;
  const alt = altText || "Sample photo";
  const canOpen = Boolean(uri && !failed && enlarge);

  // Native aspectRatio is the plate. NativeWind's `aspect-[4/3]` is an
  // arbitrary class this pipeline has shipped as a silent no-op before, and
  // without a real ratio a dark sample fills the client's-eye screen.
  const aspectRatio = ratio === "wide" ? 4 / 3 : 1;

  function onImageError() {
    if (drawDirect) setDirectRefused(true);
    else signed.onError();
  }

  function onImageLoad() {
    setLoadedUri(uri);
    if (!drawDirect) signed.onLoad();
  }

  const picture = (
    <Image
      testID="sample-photo-image"
      source={{ uri: uri! }}
      accessibilityLabel={alt}
      resizeMode="cover"
      style={{ width: "100%", height: "100%" }}
      onLoad={onImageLoad}
      onError={onImageError}
    />
  );

  return (
    <CropMarkFrame gutter={gutter}>
      <View className="w-full" style={{ aspectRatio }}>
        {uri && !failed ? (
          <View collapsable={false} style={{ width: "100%", height: "100%" }}>
            {/* The sweep sits under the photo until it has painted, so a slow
                photo on mobile data reads as arriving rather than missing. */}
            {loadedUri !== uri ? (
              <View pointerEvents="none" className="absolute inset-0">
                <SkeletonBlock className="h-full w-full" />
              </View>
            ) : null}
            {enlarge ? (
              <Pressable
                onPress={() => setOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${alt} larger`}
                accessibilityHint="Opens the sample full screen so you can pinch to zoom"
                style={{ width: "100%", height: "100%" }}
              >
                {picture}
              </Pressable>
            ) : (
              picture
            )}
            {canOpen ? (
              <SamplePhotoViewer
                uri={uri}
                alt={alt}
                open={open}
                onClose={() => setOpen(false)}
              />
            ) : null}
          </View>
        ) : !fileId && !direct ? (
          <View className="flex-1 items-center justify-center gap-1 p-3">
            <ImagePlus size={18} color={colors.textMuted} strokeWidth={2} />
            <Text className="text-center text-caption text-text-muted">
              {emptyLabel ?? "No sample yet"}
            </Text>
          </View>
        ) : failed ? (
          <View className="flex-1 items-center justify-center gap-1 p-3">
            <ImageOff size={18} color={colors.textMuted} strokeWidth={2} />
            <Text className="text-center text-caption text-text-muted">
              This photo will not load
            </Text>
          </View>
        ) : (
          <View
            testID="sample-photo-loading"
            accessible
            accessibilityLabel={`${alt}, loading`}
            className="h-full w-full"
          >
            <SkeletonBlock className="h-full w-full" />
          </View>
        )}
      </View>
    </CropMarkFrame>
  );
}
