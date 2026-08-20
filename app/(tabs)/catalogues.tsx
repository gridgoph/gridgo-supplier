import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { AlertsBell } from "@/components/AlertsBell";
import { BoardPager } from "@/components/BoardPager";
import { BoardRail } from "@/components/BoardRail";
import { BusyOverlay } from "@/components/BusyOverlay";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ListingCard } from "@/components/ListingCard";
import { ListingRow } from "@/components/ListingRow";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SkeletonBlock } from "@/components/Skeleton";
import {
  EMPTY_BOARD_BODY,
  EMPTY_BOARD_TITLE,
  type Listing,
} from "@/lib/listings";
import {
  CATALOGUE_SORTS,
  PAGE_SIZE,
  filterCatalogue,
  kindsWithListings,
  paginate,
  sortCatalogue,
  type CatalogueSort,
  type OnBoardFilter,
} from "@/lib/catalogueBoard";
import { ARCHIVED_SENTENCE, BOARD_NOT_OPEN_YET, removeListing } from "@/lib/listingsApi";
import { useBoard } from "@/hooks/useBoard";
import { useCatalogueView } from "@/hooks/useCatalogueView";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import { askConfirm, askPick } from "@/store/sheets";
import { isMatchable, useSession } from "@/store/session";

/**
 * Catalogues — the shop's own samples, as a wall or as a list of quotes.
 *
 * A print shop's board is a wall, not a spreadsheet: a client picks by looking
 * at what came off this shop's machine. So the photo is the tile and everything
 * else is a caption. A shop that is scanning prices can flip to a list of quote
 * strips, filter by standing, and sort by name, quote or ready-in. The job
 * floor still has the only ranking that decides which job is next; this is how
 * the shop looks at its own samples.
 *
 * It is one of the five tabs now, where the alerts inbox used to be. A shop
 * changes a price or adds a sample between jobs, all day, and reaching that
 * through Account was three taps from anywhere. The masthead says "Catalogues"
 * because the tab does; the body keeps saying "your board", which is what a
 * shop calls it out loud.
 *
 * A shop still with Operations gets the whole screen. Approval requires a
 * finished listing, so making a waiting shop wait for the thing it is waiting
 * for would be the wrong door.
 */
export default function BoardScreen() {
  const colors = useThemeColors();
  const user = useSession((s) => s.user);
  const approved = isMatchable(user);
  const { listings, catalog, services, loading, loaded, notOpenYet, error, reload, dropListing } =
    useBoard();
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const [view, setView] = useCatalogueView();
  const [kind, setKind] = useState("all");
  const [onBoard, setOnBoard] = useState<OnBoardFilter>("all");
  const [sort, setSort] = useState<CatalogueSort>("board");
  const [page, setPage] = useState(1);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Take one listing off the shop, from the wall.
   *
   * The editor has the same action at the foot of a long form, which on a phone
   * is under whatever the platform is drawing over the bottom of the screen. A
   * shop that wants a listing gone should be able to do it from the thing it is
   * looking at.
   */
  const remove = useCallback(
    async (listing: Listing) => {
      const confirmed = await askConfirm({
        question: `Remove “${listing.name || "this listing"}” from your shop?`,
        consequence:
          "It comes off your board and its samples, steps and prices go with it. A listing a client has already ordered from is kept for that job's history instead.",
        confirmLabel: "Remove it",
        cancelLabel: "Keep it",
        destructive: true,
      });
      if (!confirmed) return;

      setRemoving(true);
      setRemoveError(null);
      setNotice(null);
      const result = await removeListing(listing);
      if (result.status === "ok") {
        dropListing(listing.id);
        setNotice(result.value === "archived" ? ARCHIVED_SENTENCE : null);
        await reload();
      } else {
        setRemoveError(
          result.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : result.message,
        );
      }
      setRemoving(false);
    },
    [dropListing, reload],
  );

  const firstLoad = loading && !loaded;
  const kinds = kindsWithListings(listings, catalog);
  const activeKind = kind === "all" || kinds.some((entry) => entry.code === kind) ? kind : "all";
  const filtered = sortCatalogue(filterCatalogue(listings, activeKind, onBoard), sort, services);
  const paged = paginate(filtered, page);
  const visible = paged.items;

  async function pickKind() {
    const picked = await askPick({
      title: "Kind of work",
      options: [
        { value: "all", label: "All work" },
        ...kinds.map((entry) => ({ value: entry.code, label: entry.name })),
      ],
      selected: activeKind,
    });
    if (!picked) return;
    setKind(picked);
    setPage(1);
  }

  async function pickSort() {
    const picked = await askPick({
      title: "Sort",
      options: CATALOGUE_SORTS.map((entry) => ({
        value: entry.value,
        label: entry.label,
        detail: entry.detail,
      })),
      selected: sort,
    });
    if (!picked) return;
    setSort(picked as CatalogueSort);
    setPage(1);
  }

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        <ScreenHeader title="Catalogues" right={<AlertsBell />} />

        {/*
          Demoted to a footnote on purpose. It is a real thing to know once —
          a better board does not bring more work, it decides what a client
          picks when GRIDGO has already sent them here — and a shop that reads
          it as a promise spends the afternoon on product copy instead of the
          proof photo holding up its money.
        */}
        <Text className="text-caption text-text-muted">
          GRIDGO still decides which shop a job goes to. This is what a client is choosing when
          it comes to you.
        </Text>

        {!approved ? (
          <View className="gg-panel mt-6 gap-1">
            <Text className="text-body font-medium text-text-primary">
              Operations is still reviewing your shop
            </Text>
            <Text className="text-body text-text-secondary">
              Build your board while you wait. Clients see it the moment your accreditation
              clears, and Operations wants at least one finished listing before then.
            </Text>
          </View>
        ) : null}

        {firstLoad ? (
          <View
            className="mt-8"
            accessibilityRole="progressbar"
            accessibilityLabel="Loading your board"
          >
            <View className="-mx-1.5 flex-row flex-wrap">
              {[0, 1, 2, 3].map((key) => (
                <View key={key} className="w-1/2 px-1.5 pb-3">
                  <SkeletonBlock className="h-56 w-full rounded-card" />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {notOpenYet ? (
          <View className="mt-8">
            <EmptyState
              title="Your board is not open yet"
              body={BOARD_NOT_OPEN_YET}
              actionLabel="Check again"
              onAction={() => void reload()}
            />
          </View>
        ) : null}

        {error && !listings.length ? (
          <View className="mt-8">
            <EmptyState
              title="Your board is not reachable"
              body={error}
              actionLabel="Try again"
              onAction={() => void reload()}
            />
          </View>
        ) : error ? (
          <View className="mt-6">
            <ErrorNotice message={error} onRetry={() => void reload()} />
          </View>
        ) : null}

        {!firstLoad && !notOpenYet && !error && !listings.length ? (
          <View className="mt-8">
            <EmptyState
              title={EMPTY_BOARD_TITLE}
              body={EMPTY_BOARD_BODY}
              actionLabel="Put something on the board"
              onAction={() => router.push("/shop/new")}
            />
          </View>
        ) : null}

        {listings.length ? (
          <View className="mt-8 gap-3">
            <BoardRail
              count={listings.length}
              view={view}
              onViewChange={setView}
              kinds={kinds}
              kind={activeKind}
              onPickKind={() => void pickKind()}
              onBoard={onBoard}
              onOnBoardChange={(next) => {
                setOnBoard(next);
                setPage(1);
              }}
              sort={sort}
              onPickSort={() => void pickSort()}
              onAdd={() => router.push("/shop/new")}
            />
            {notice ? (
              <View className="gg-panel">
                <Text className="text-body text-text-secondary">{notice}</Text>
              </View>
            ) : null}
            {removeError ? <ErrorNotice message={removeError} /> : null}
            {filtered.length === 0 ? (
              <Text className="text-body text-text-secondary">
                Nothing matches that cut. Show all work, or switch the on-the-board toggle.
              </Text>
            ) : (
              <>
                <Wall
                  listings={visible}
                  view={view}
                  catalog={catalog}
                  services={services}
                  shopApproved={approved}
                  onRemove={removing ? undefined : remove}
                />
                <BoardPager
                  page={paged.page}
                  pageCount={paged.pageCount}
                  total={paged.total}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                />
              </>
            )}
          </View>
        ) : null}
      </ScrollView>

      <BusyOverlay visible={removing} label="Removing this listing…" />
    </View>
  );
}

/** The shop's own order: a wall of samples, or a stack of quotes. */
function Wall({
  listings,
  view,
  catalog,
  services,
  shopApproved,
  onRemove,
}: {
  listings: Listing[];
  view: ReturnType<typeof useCatalogueView>[0];
  catalog: ReturnType<typeof useBoard>["catalog"];
  services: ReturnType<typeof useBoard>["services"];
  shopApproved: boolean;
  onRemove?: (listing: Listing) => void;
}) {
  if (view === "list") {
    return (
      <View className="gap-2">
        {listings.map((listing) => (
          <ListingRow
            key={listing.id}
            listing={listing}
            catalog={catalog}
            services={services}
            shopApproved={shopApproved}
            onPress={() =>
              router.push({ pathname: "/shop/[id]", params: { id: listing.id } })
            }
            onRemove={onRemove ? () => onRemove(listing) : undefined}
          />
        ))}
      </View>
    );
  }

  return (
    <View className="-mx-1.5 flex-row flex-wrap">
      {listings.map((listing) => (
        <View key={listing.id} collapsable={false} className="w-1/2 px-1.5 pb-3">
          <ListingCard
            listing={listing}
            catalog={catalog}
            services={services}
            shopApproved={shopApproved}
            onPress={() =>
              router.push({ pathname: "/shop/[id]", params: { id: listing.id } })
            }
            onRemove={onRemove ? () => onRemove(listing) : undefined}
          />
        </View>
      ))}
    </View>
  );
}
