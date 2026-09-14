import { ImageOff, ImagePlus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";

import { CropMarkFrame } from "@/components/CropMarkFrame";
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
 */
export function SamplePhoto({
  fileId,
  localUri,
  altText,
  ratio = "square",
  gutter = "standard",
  emptyLabel,
}: Props) {
  const colors = useThemeColors();
  const [uri, setUri] = useState<string | null>(localUri ?? heldLink(fileId));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (localUri) {
      setUri(localUri);
      setFailed(false);
      return;
    }
    if (!fileId) {
      setUri(null);
      setFailed(false);
      return;
    }

    // A different sample in the same frame — replacing one, or reordering the
    // strip. Last sample's link and last sample's failure both go with it, or
    // the frame keeps showing the photo that has just been taken down, and one
    // refusal sticks to every photo that lands in that position afterwards.
    const held = heldLink(fileId);
    setUri(held);
    setFailed(false);
    if (held) return;

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
            <Image
              source={{ uri }}
              accessibilityLabel={altText || "Sample photo"}
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
