import { ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { router, useLocalSearchParams } from "expo-router";

import { SwitchRow } from "@/components/controls/SwitchRow";
import { DangerButton } from "@/components/DangerButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SheetSurface } from "@/components/SheetSurface";
import { useThemeColors } from "@/hooks/useTheme";
import { awaitsFirstApproval, isTakenDown, priceLine, type Listing } from "@/lib/listings";
import { ARCHIVED_SENTENCE, BOARD_NOT_OPEN_YET, loadListing, removeListing, saveListing } from "@/lib/listingsApi";
import { productHref, templateStanding } from "@/lib/productTemplates";
import { useListingWizard } from "@/store/listingWizard";
import { endPhotoPolicySubmission, ensurePhotoPolicy } from "@/store/photoPolicy";
import { askConfirm } from "@/store/sheets";

const PRODUCT_CHANGED_MESSAGE =
  "This product changed on another screen or phone. The latest is loaded — check it and remove it again.";

/** Why a product has no show/hide switch here. */
function visibilityLine(listing: Listing): string {
  if (isTakenDown(listing)) return "Taken down by GRIDGO. Only GRIDGO can put it back.";
  return "Not approved yet. Open it to finish it and send it for review.";
}

/**
 * One product's quick actions from My shop (gridgo-supplier#267): show it to
 * clients or hide it, open it to change prices and ready time, or remove it.
 *
 * Hiding keeps every price, option and ready time, so it is a switch with an
 * Undo, not a question. Removing is the one thing here that cannot be taken
 * back, so it asks first and says that open orders still finish.
 */
export default function ProductActionsSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string; undo?: boolean } | null>(null);

  const apply = useCallback((result: Awaited<ReturnType<typeof loadListing>>) => {
    if (result.status === "ok") {
      setListing(result.value);
      setLoadError(null);
    } else {
      setLoadError(result.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : result.message);
    }
  }, []);

  const load = useCallback(async () => {
    if (id) apply(await loadListing(id));
  }, [apply, id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void loadListing(id).then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apply, id]);

  async function setShown(next: boolean, fromUndo = false) {
    if (!listing || busy) return;
    if (next) {
      // Putting a listing up is a submission: the photo policies come first.
      const policy = await ensurePhotoPolicy(listing, "submit");
      if (policy === "check_photos") {
        router.back();
        router.push({ pathname: "/shop/[id]/photos", params: { id: listing.id } });
        return;
      }
      if (policy !== "confirmed") return;
    }
    setBusy(true);
    setFeedback(null);
    const result = await saveListing(listing, { active: next });
    setBusy(false);
    if (next && result.status === "ok") endPhotoPolicySubmission(listing.id);
    if (result.status === "ok") {
      setListing(result.value);
      setFeedback({
        ok: true,
        message: next
          ? "Live again. Clients can order it."
          : "Hidden. Clients cannot see it. Your prices and ready time are kept.",
        undo: !next && !fromUndo,
      });
    } else {
      setFeedback({ ok: false, message: result.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : result.message });
      // GRIDGO may have refused because the listing moved on: show its latest.
      void load();
    }
  }

  async function remove() {
    if (!listing || busy) return;
    const confirmed = await askConfirm({
      question: `Remove “${listing.name || "this product"}” from your shop?`,
      consequence:
        "Clients can no longer order it, and its photos, steps and prices go with it. Open orders for it still get finished.",
      confirmLabel: "Remove it",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(true);
    setFeedback(null);
    const result = await removeListing(listing);
    setBusy(false);
    if (result.status === "ok") {
      useListingWizard.getState().forget(listing.id);
      setFeedback({
        ok: true,
        message: result.value === "archived" ? ARCHIVED_SENTENCE : "Removed from your shop.",
      });
      setListing(null);
      return;
    }
    if (result.status === "not_open_yet") {
      setFeedback({ ok: false, message: BOARD_NOT_OPEN_YET });
      return;
    }
    // Read it again so the next Remove carries GRIDGO's current version. When
    // the version moved, another phone changed it: the shop looks again and
    // confirms again — nothing is removed on its behalf.
    const latest = await loadListing(listing.id);
    apply(latest);
    const moved = latest.status === "ok" && latest.value.version !== listing.version;
    setFeedback({ ok: false, message: moved ? PRODUCT_CHANGED_MESSAGE : result.message });
  }

  // A listing GRIDGO took down, or one waiting for its first approval, is not
  // the shop's to switch on from here: the editor says what it needs.
  // A template product may be hidden or shown while its price check is pending.
  const switchable =
    listing != null &&
    (listing.template?.managed
      ? templateStanding(listing).switchable
      : !isTakenDown(listing) && !awaitsFirstApproval(listing));

  return (
    <SheetSurface
      title={listing?.name || (feedback?.ok ? "Product removed" : "Product")}
      body={listing ? priceLine(listing) : undefined}
      footer={
        <>
          {listing ? <DangerButton label="Remove product" onPress={() => void remove()} disabled={busy} /> : null}
          <SecondaryButton label="Done" onPress={() => router.back()} />
          {listing ? (
            <Text className="text-center text-caption text-text-muted">
              Open orders for this product still get finished.
            </Text>
          ) : null}
        </>
      }
    >
      {feedback ? (
        <View className="mb-3 flex-row items-center gap-3" accessibilityLiveRegion="polite">
          <Text
            className={feedback.ok ? "min-w-0 flex-1 text-body text-success" : "min-w-0 flex-1 text-body text-error"}
            testID="product-feedback"
          >
            {feedback.message}
          </Text>
          {feedback.undo ? (
            <Pressable
              onPress={() => void setShown(true, true)}
              accessibilityRole="button"
              accessibilityLabel="Undo, show it to clients again"
              className="gg-touch justify-center px-2"
            >
              <Text className="text-button text-text-primary underline">Undo</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!listing ? (
        feedback?.ok ? null : (
          <Text className="text-body text-text-secondary">{loadError ?? "Loading this product…"}</Text>
        )
      ) : (
        <View className="gap-1">
          {switchable ? (
            <SwitchRow
              label={listing.onTheBoard ? "Live" : "Hidden"}
              hint="Hiding is instant. Your prices are kept."
              value={listing.onTheBoard}
              disabled={busy}
              onChange={(next) => void setShown(next)}
            />
          ) : (
            <Text className="py-2 text-body text-text-secondary">{visibilityLine(listing)}</Text>
          )}
          <View className="gg-divider" />
          <Pressable
            onPress={() => {
              router.back();
              router.push(productHref(listing));
            }}
            accessibilityRole="button"
            accessibilityLabel="Edit prices and ready time"
            className="gg-touch flex-row items-center gap-3 py-3"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Text className="min-w-0 flex-1 text-body-lg text-text-primary">Edit prices and ready time</Text>
            <ChevronRight size={20} color={colors.textMuted} aria-hidden />
          </Pressable>
        </View>
      )}
    </SheetSurface>
  );
}
