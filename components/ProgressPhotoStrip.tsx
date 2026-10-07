import { Camera, ImageOff } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";

import { SamplePhotoViewer } from "@/components/SamplePhotoViewer";
import { SkeletonBlock } from "@/components/Skeleton";
import { useSignedLink } from "@/hooks/useSignedLink";
import { useThemeColors } from "@/hooks/useTheme";
import { formatTimelineAt } from "@/lib/dates";
import { milestoneDefinition } from "@/lib/milestones";
import type { ProgressPhotoView } from "@/lib/productionPhoto";
import { rememberLink } from "@/lib/signedLinks";

type Props = {
  photos: ProgressPhotoView[];
  label?: string;
};

/**
 * The job's progress photos as a contact strip: every picture the client
 * sees on their order, oldest first, each stamped with when it reached GRIDGO.
 *
 * A photo the shop also filed as payout proof says so under it. That is the
 * point of the strip on a job waiting to be packed — a shop that photographed
 * the press to get paid sees that picture already standing as its production
 * photo, instead of wondering whether it has to take the same shot twice.
 *
 * Plain rounded plates, not the crop-mark frame: register marks say "print
 * sample", and these are pictures of a job on the floor.
 */
export function ProgressPhotoStrip({ photos, label = "Progress photo" }: Props) {
  if (!photos.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-3"
      accessibilityRole="list"
      accessibilityLabel={`${photos.length} ${label.toLowerCase()}${photos.length === 1 ? "" : "s"}`}
    >
      {photos.map((photo, index) => (
        <ProgressPhotoTile key={photo.fileId} photo={photo} index={index + 1} label={label} />
      ))}
    </ScrollView>
  );
}

function ProgressPhotoTile({ photo, index, label }: { photo: ProgressPhotoView; index: number; label: string }) {
  const colors = useThemeColors();
  // The order read carried a link; keep it so the plate draws without a second request.
  rememberLink(photo.fileId, photo.downloadUrl, photo.downloadUrlExpiresAt);
  const picture = useSignedLink(photo.fileId);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  const when = photo.at ? formatTimelineAt(photo.at) : null;
  const proof = photo.proofOf ? milestoneDefinition(photo.proofOf).proofName : null;
  const alt = `${label} ${index}${when ? `, ${when}` : ""}${proof ? `, also your ${proof} proof` : ""}`;

  return (
    <View className="w-28 gap-1.5" accessibilityRole="none">
      <View className="h-28 w-28 overflow-hidden rounded-field border border-outline bg-surface-variant">
        {picture.uri && !picture.failed ? (
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
              testID="progress-photo-image"
              source={{ uri: picture.uri }}
              accessibilityLabel={alt}
              resizeMode="cover"
              style={{ width: "100%", height: "100%" }}
              onLoad={() => {
                setLoaded(true);
                picture.onLoad();
              }}
              onError={picture.onError}
            />
          </Pressable>
        ) : picture.failed ? (
          <View className="flex-1 items-center justify-center gap-1 p-2" accessibilityLabel={`${alt}, will not load`}>
            <ImageOff size={18} color={colors.textMuted} strokeWidth={2} />
            <Text className="text-center text-caption text-text-muted">Will not load</Text>
          </View>
        ) : (
          <SkeletonBlock className="h-full w-full" />
        )}
      </View>
      {when ? (
        <Text className="text-caption text-text-muted" numberOfLines={1}>
          {when}
        </Text>
      ) : null}
      {proof ? (
        <View className="flex-row items-center gap-1">
          <Camera size={12} color={colors.textMuted} strokeWidth={2} aria-hidden />
          <Text className="min-w-0 flex-1 text-caption text-text-secondary" numberOfLines={2}>
            Also your {proof} proof
          </Text>
        </View>
      ) : null}
      {picture.uri && open ? (
        <SamplePhotoViewer uri={picture.uri} alt={alt} open={open} onClose={() => setOpen(false)} />
      ) : null}
    </View>
  );
}
