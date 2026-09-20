import { ImageOff, ImagePlus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { CropMarkFrame } from "@/components/CropMarkFrame";
import { SamplePhotoViewer } from "@/components/SamplePhotoViewer";
import { SkeletonBlock } from "@/components/Skeleton";
import * as api from "@/lib/api";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** A sample GRIDGO already holds. */
  fileId?: string | null;
  /** A photo just picked on this phone, before it has been sent. */
  localUri?: string | null;
  /** What the sample shows, for anyone who cannot see it. */
  altText?: string | null;
  /** Square on the wall, wider on a preview header. */
  ratio?: "square" | "wide";
  gutter?: "tight" | "standard";
  /** What an empty frame says. A blank plate reads as a broken listing. */
  emptyLabel?: string;
};

/**
 * One sample photo, in its crop-mark frame.
 *
 * GRIDGO hands out a short-lived signed link per view, so nothing here stores a
 * URL — only the file id GRIDGO gave us, and a link asked for again when it
 * expires. Links are held in memory for as long as they are valid because a
 * two-column wall asks for the same eight photos every time the screen regains
 * focus, and asking again for a link that has not expired is a request a shop
 * on mobile data pays for twice.
 *
 * A photo that will not load says so in words. An empty grey square on a board
 * of samples reads as a listing with nothing on it.
 *
 * A stored photo is a press: the tile stays the board, and the loupe is a
 * full-screen pinch so a shop can read the print rather than the thumbnail.
 */
export function SamplePhoto(props: Props) {
  // A replacement source owns fresh loading/error state before it is painted.
  return <PhotoFrame key={JSON.stringify([props.fileId, props.localUri])} {...props} />;
}

function PhotoFrame({
  fileId,
  localUri,
  altText,
  ratio = "square",
  gutter = "standard",
  emptyLabel,
}: Props) {
  const colors = useThemeColors();
  const [uri, setUri] = useState<string | null>(() => localUri ?? heldLink(fileId));
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const alt = altText || "Sample photo";
  const canOpen = Boolean(uri && !failed);

  useEffect(() => {
    if (localUri || !fileId) return;

    let cancelled = false;
    void (async () => {
      const link = await signedLink(fileId);
      if (cancelled) return;
      if (link) setUri(link);
      else setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, localUri]);

  // Native aspectRatio is the plate. NativeWind's `aspect-[4/3]` is an
  // arbitrary class this pipeline has shipped as a silent no-op before, and
  // without a real ratio a dark sample fills the client's-eye screen.
  const aspectRatio = ratio === "wide" ? 4 / 3 : 1;

  return (
    <CropMarkFrame gutter={gutter}>
      <View className="w-full" style={{ aspectRatio }}>
        {uri && !failed ? (
          <View collapsable={false} style={{ width: "100%", height: "100%" }}>
            <Pressable
              onPress={() => setOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${alt} larger`}
              accessibilityHint="Opens the sample full screen so you can pinch to zoom"
              style={{ width: "100%", height: "100%" }}
            >
              <Image
                source={{ uri }}
                accessibilityLabel={alt}
                resizeMode="cover"
                style={{ width: "100%", height: "100%" }}
                onError={() => {
                  // Local URI first; once GRIDGO has stored the file, a refused
                  // local preview can still show the signed link.
                  if (fileId && localUri && uri === localUri) {
                    void signedLink(fileId).then((link) => {
                      if (link) setUri(link);
                      else setFailed(true);
                    });
                    return;
                  }
                  setFailed(true);
                }}
              />
            </Pressable>
            {canOpen ? (
              <SamplePhotoViewer
                uri={uri}
                alt={alt}
                open={open}
                onClose={() => setOpen(false)}
              />
            ) : null}
          </View>
        ) : !fileId && !localUri ? (
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
          <SkeletonBlock className="h-full w-full" />
        )}
      </View>
    </CropMarkFrame>
  );
}

/**
 * A viewing link for one stored file.
 *
 * Memory only, and dropped a minute before GRIDGO would stop honouring it, so
 * a link is never handed to an `<Image>` that is about to be refused.
 */
const links = new Map<string, { url: string; goodUntil: number }>();

/** A link already in hand, without a round trip. Null means one is needed. */
function heldLink(fileId?: string | null): string | null {
  if (!fileId) return null;
  const held = links.get(fileId);
  return held && held.goodUntil > Date.now() ? held.url : null;
}

async function signedLink(fileId: string): Promise<string | null> {
  const held = heldLink(fileId);
  if (held) return held;

  try {
    const link = await api.getDownloadUrl(fileId);
    const seconds = Number.isFinite(link.expiresInSeconds) ? link.expiresInSeconds : 60;
    links.set(fileId, {
      url: link.url,
      goodUntil: Date.now() + Math.max(0, seconds - 60) * 1000,
    });
    return link.url;
  } catch {
    return null;
  }
}
