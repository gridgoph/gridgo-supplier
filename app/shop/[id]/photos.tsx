import { Star } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { BusyOverlay } from "@/components/BusyOverlay";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { SamplePhoto } from "@/components/SamplePhoto";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { UploadList } from "@/components/UploadList";
import { LISTING_CAPS, photoViewUrl } from "@/lib/listings";
import { attachPhoto, BOARD_NOT_OPEN_YET, removePhoto, setPhotoOrder } from "@/lib/listingsApi";
import { askConfirm } from "@/store/sheets";
import { useFileUpload } from "@/hooks/useFileUpload";
import { routeId, useListing } from "@/hooks/useBoard";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The samples on one listing.
 *
 * Its own screen because this is a camera roll, not a form: a shop photographs
 * a tarpaulin on the rack, checks it is the right one, and puts it first. The
 * board photo is the only ordering decision a client ever sees, so it is the
 * only one offered — as "make this the board photo", not a drag handle nobody
 * finds.
 *
 * Nothing counts as filed until GRIDGO returns a stored id and accepts the
 * attach. An upload that reached 100% and then failed is still a listing with
 * no sample on it, and this screen says so rather than showing a frame that
 * will be empty tomorrow.
 *
 * A sample comes off by sending the photos that stay. Replace still swaps
 * one in place when the shop wants a different picture in the same slot.
 */
export default function SamplePhotosScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = routeId(params.id);
  const colors = useThemeColors();
  const { listing, loading, notOpenYet, error, reload } = useListing(id);
  const uploads = useFileUpload("catalog_item_photo");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Which position the next stored upload takes; null means "on the end". */
  const [replacing, setReplacing] = useState<number | null>(null);
  const filing = useRef<Set<string>>(new Set());

  const photos = useMemo(() => listing?.photos ?? [], [listing]);
  const full = photos.length >= LISTING_CAPS.photos;
  const { items, markAttached, remove: dropUpload } = uploads;

  /**
   * A stored upload is only half a sample: GRIDGO has the bytes, and the
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
      const result = await attachPhoto(
        stored.fileId as string,
        listing.id,
        replacing ?? photos.length,
      );
      if (result.status === "ok") {
        markAttached(stored.key);
        dropUpload(stored.key);
        setActionError(null);
        setReplacing(null);
        await reload();
      } else {
        setActionError(
          result.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : result.message,
        );
      }
      setBusy(false);
    })();
  }, [items, markAttached, dropUpload, listing, photos.length, replacing, reload]);

  const takeOff = useCallback(
    async (fileId: string) => {
      if (!listing) return;
      const confirmed = await askConfirm(
        {
          question: `Take this sample off “${listing.name || "this listing"}”?`,
          consequence: "It will no longer appear on this listing. You can add another sample afterwards.",
          confirmLabel: "Remove",
          cancelLabel: "Keep it",
          destructive: true,
        },
        "/shop/confirm",
      );
      if (!confirmed) return;
      setBusy(true);
      const result = await removePhoto(listing, fileId);
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

  const makeFirst = useCallback(
    async (fileId: string) => {
      if (!listing) return;
      setBusy(true);
      const result = await setPhotoOrder(listing, [
        fileId,
        ...photos.filter((photo) => photo.fileId !== fileId).map((photo) => photo.fileId),
      ]);
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
    [listing, photos, reload],
  );

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
          title={notOpenYet ? "Your board is not open yet" : "This listing did not load"}
          body={
            notOpenYet
              ? BOARD_NOT_OPEN_YET
              : (error ?? "GRIDGO did not answer for this listing. Try again in a moment.")
          }
          actionLabel="Try again"
          onAction={() => void reload()}
        />
      </View>
    );
  }

  const picking = busy || uploads.busy;

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
          <View className="-mx-1.5 mt-6 flex-row flex-wrap">
            {photos.map((photo, index) => (
              <View key={photo.fileId} className="w-1/2 px-1.5 pb-3">
                <View className="gg-card-flush">
                  <SamplePhoto
                    fileId={photo.fileId}
                    url={photoViewUrl(photo)}
                    altText={photo.altText ?? listing.name}
                  />
                  <View className="gap-2 px-3 pb-3">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="min-w-0 flex-1 text-caption text-text-muted">
                        {index === 0 ? "Board photo" : `Sample ${index + 1}`}
                      </Text>
                      {index === 0 ? null : (
                        <Pressable
                          onPress={() => void makeFirst(photo.fileId)}
                          disabled={picking}
                          accessibilityRole="button"
                          accessibilityLabel="Make this the board photo"
                          className="gg-touch items-center justify-center"
                          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                        >
                          <Star size={18} color={colors.textMuted} strokeWidth={2} />
                        </Pressable>
                      )}
                    </View>
                    <SecondaryButton
                      label={replacing === index ? "Choosing…" : "Replace"}
                      disabled={picking}
                      onPress={() => {
                        setReplacing(index);
                        void uploads.pickImage();
                      }}
                    />
                    <SecondaryButton
                      label="Remove"
                      disabled={picking}
                      onPress={() => void takeOff(photo.fileId)}
                    />
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
              That is all eight samples. Replace one instead of adding another.
            </Text>
          ) : (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <SecondaryButton
                  label="Take a photo"
                  disabled={picking}
                  onPress={() => {
                    setReplacing(null);
                    void uploads.takePhoto();
                  }}
                />
              </View>
              <View className="flex-1">
                <SecondaryButton
                  label="Choose a photo"
                  disabled={picking}
                  onPress={() => {
                    setReplacing(null);
                    void uploads.pickImage();
                  }}
                />
              </View>
            </View>
          )}
          <Text className="text-caption text-text-muted">
            JPEG, PNG or WebP. Shoot it in daylight against a plain wall — that is what makes a
            board look like a shop rather than a listing site. Remove a sample you do not want,
            or put another in its place.
          </Text>
        </View>
      </ScrollView>

      <BusyOverlay visible={busy} label="Filing your sample with GRIDGO…" />
    </View>
  );
}
