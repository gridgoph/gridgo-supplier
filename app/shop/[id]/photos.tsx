import { Camera, ImagePlus, Star, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { BusyOverlay } from "@/components/BusyOverlay";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { SamplePhoto } from "@/components/SamplePhoto";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { UploadList } from "@/components/UploadList";
import { LISTING_CAPS } from "@/lib/listings";
import { attachPhoto, BOARD_NOT_OPEN_YET, setPhotoOrder } from "@/lib/listingsApi";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useListing } from "@/hooks/useBoard";
import { useThemeColors } from "@/hooks/useTheme";
import { askConfirm } from "@/store/sheets";

/**
 * The samples on one listing.
 *
 * Its own screen because this is a camera roll, not a form: a shop photographs
 * a tarpaulin on the rack, checks it is the right one, and puts it first. The
 * first photo is the board thumbnail, which is the only ordering decision that
 * changes anything a client sees — so it is the only one offered, as "make this
 * the board photo" rather than a drag handle nobody finds.
 *
 * Nothing is counted as filed until GRIDGO returns a stored id and accepts the
 * attach. An upload that reached 100% and then failed is still a listing with
 * no sample on it, and this screen says so.
 */
export default function SamplePhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const { listing, loading, notOpenYet, error, reload } = useListing(id);
  const uploads = useFileUpload("catalog_item_photo");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const filing = useRef<Set<string>>(new Set());

  const photos = listing?.photos ?? [];
  const full = photos.length >= LISTING_CAPS.photos;
  const { items, markAttached, remove: dropUpload } = uploads;

  /**
   * A stored upload is only half of a sample: GRIDGO has the bytes, and the
   * listing still has to be told about them. This is the second half, run once
   * per upload — the ref is what stops a re-render filing the same file twice.
   */
  useEffect(() => {
    const stored = items.find(
      (item) => item.stage === "stored" && item.fileId && !filing.current.has(item.key),
    );
    if (!stored?.fileId || !listing) return;

    filing.current.add(stored.key);
    void (async () => {
      setBusy(true);
      const result = await attachPhoto(stored.fileId as string, listing.id, photos.length);
      if (result.status === "ok") {
        markAttached(stored.key);
        dropUpload(stored.key);
        setActionError(null);
        await reload();
      } else {
        setActionError(
          result.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : result.message,
        );
      }
      setBusy(false);
    })();
  }, [items, markAttached, dropUpload, listing, photos.length, reload]);

  const reorder = useCallback(
    async (fileIds: string[]) => {
      if (!listing) return;
      setBusy(true);
      const result = await setPhotoOrder(listing.id, fileIds);
      if (result.status === "ok") {
        setActionError(null);
        await reload();
      } else {
        setActionError(
          result.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : result.message,
        );
      }
      setBusy(false);
    },
    [listing, reload],
  );

  async function makeFirst(fileId: string) {
    await reorder([
      fileId,
      ...photos.filter((photo) => photo.fileId !== fileId).map((photo) => photo.fileId),
    ]);
  }

  async function remove(fileId: string) {
    const confirmed = await askConfirm({
      question: "Take this sample off the listing?",
      consequence:
        "Clients stop seeing it. If it is the only one, this listing comes off the board until you add another.",
      confirmLabel: "Take it off",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!confirmed) return;
    await reorder(photos.filter((photo) => photo.fileId !== fileId).map((photo) => photo.fileId));
  }

  if (loading && !listing) {
    return (
      <View
        className="gg-screen gg-page pt-4"
        accessibilityRole="progressbar"
        accessibilityLabel="Loading your samples"
      >
        <SkeletonBlock className="h-5 w-1/2" />
        <View className="mt-6 flex-row flex-wrap">
          <View className="w-1/2 p-1.5">
            <SkeletonBlock className="h-40 w-full rounded-card" />
          </View>
          <View className="w-1/2 p-1.5">
            <SkeletonBlock className="h-40 w-full rounded-card" />
          </View>
        </View>
      </View>
    );
  }

  if (notOpenYet || !listing) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title={notOpenYet ? "Your board is not open yet" : "This listing is not reachable"}
          body={notOpenYet ? BOARD_NOT_OPEN_YET : (error ?? "GRIDGO did not return this listing.")}
          actionLabel="Try again"
          onAction={() => void reload()}
        />
      </View>
    );
  }

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">Sample photos</Text>
          <Text className="text-body text-text-secondary">
            Work that came off your own machine. A client picks a shop by looking at these, so a
            real print beats a stock picture every time.
          </Text>
          <Text className="text-caption text-text-muted">
            {photos.length} of {LISTING_CAPS.photos} used. The first one is your board photo.
          </Text>
        </View>

        {photos.length ? (
          <View className="mt-6 -mx-1.5 flex-row flex-wrap">
            {photos.map((photo, index) => (
              <View key={photo.fileId} className="w-1/2 px-1.5 pb-3">
                <View className="gg-card-flush">
                  <SamplePhoto fileId={photo.fileId} altText={photo.altText ?? listing.name} />
                  <View className="flex-row items-center justify-between gap-2 px-3 pb-3">
                    <Text className="text-caption text-text-muted">
                      {index === 0 ? "Board photo" : `Sample ${index + 1}`}
                    </Text>
                    <View className="flex-row items-center gap-1">
                      {index === 0 ? null : (
                        <Pressable
                          onPress={() => void makeFirst(photo.fileId)}
                          disabled={busy}
                          accessibilityRole="button"
                          accessibilityLabel="Make this the board photo"
                          className="gg-touch items-center justify-center"
                          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                        >
                          <Star size={18} color={colors.textMuted} strokeWidth={2} />
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => void remove(photo.fileId)}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel="Take this sample off the listing"
                        className="gg-touch items-center justify-center"
                        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                      >
                        <Trash2 size={18} color={colors.textMuted} strokeWidth={2} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View className="mt-6">
            <Text className="text-body text-text-secondary">
              No samples on this listing yet. It cannot go on the board without one.
            </Text>
          </View>
        )}

        {actionError ? (
          <View className="mt-6">
            <ErrorNotice message={actionError} />
          </View>
        ) : null}

        <View className="mt-8 gap-3">
          <UploadList
            items={uploads.items}
            onRetry={(key) => void uploads.retry(key)}
            onRemove={uploads.remove}
            emptyHint="Nothing is being sent right now."
          />
          {full ? (
            <Text className="text-caption text-text-muted">
              That is all eight samples. Take one off before adding another.
            </Text>
          ) : (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <SecondaryButton
                  label="Take a photo"
                  disabled={busy || uploads.busy}
                  onPress={() => void uploads.takePhoto()}
                />
              </View>
              <View className="flex-1">
                <SecondaryButton
                  label="Choose a photo"
                  disabled={busy || uploads.busy}
                  onPress={() => void uploads.pickImage()}
                />
              </View>
            </View>
          )}
          <View className="flex-row items-center gap-2">
            <Camera size={14} color={colors.textMuted} strokeWidth={2} />
            <ImagePlus size={14} color={colors.textMuted} strokeWidth={2} />
            <Text className="min-w-0 flex-1 text-caption text-text-muted">
              JPEG, PNG or WebP. Shoot it in daylight against a plain wall — that is what makes a
              board look like a shop rather than a listing site.
            </Text>
          </View>
        </View>
      </ScrollView>

      <BusyOverlay visible={busy} label="Filing your sample with GRIDGO…" />
    </View>
  );
}
