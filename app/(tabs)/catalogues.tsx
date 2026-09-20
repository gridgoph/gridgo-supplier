import { useCallback, useMemo, useState } from "react";
import { RefreshControl, Text, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { router } from "expo-router";

import { AlertsBell } from "@/components/AlertsBell";
import { BoardPager } from "@/components/BoardPager";
import { BoardRail } from "@/components/BoardRail";
import { BusyOverlay } from "@/components/BusyOverlay";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { ListingCard } from "@/components/ListingCard";
import { ListingRow } from "@/components/ListingRow";
import { ChatButton } from "@/components/ChatButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { EMPTY_BOARD_BODY, EMPTY_BOARD_TITLE, type Listing } from "@/lib/listings";
import {
  CATALOGUE_SORTS,
  DEFAULT_BOARD_QUERY,
  EMPTY_CUT_SENTENCE,
  EMPTY_HUNT_SENTENCE,
  HUNTING_LABEL,
  isHunting,
  kindsWithListings,
  narrowingCount,
  pageWindow,
  toListQuery,
  type BoardQuery,
  type CatalogueSort,
} from "@/lib/catalogueBoard";
import { ARCHIVED_SENTENCE, BOARD_NOT_OPEN_YET, removeListing } from "@/lib/listingsApi";
import { motion } from "@/constants/theme";
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
 * **The hunt, the cut and the page are GRIDGO's, not this screen's.** A shop
 * with two hundred samples used to download two hundred samples to look at
 * eight; now the words, the kind of work, the standing, the sort and the page
 * all go over the wire and PostgreSQL answers them. What is left here is
 * holding the question and telling the three empty walls apart: a board with
 * nothing on it, a hunt that found nothing, and a cut that found nothing are
 * different facts and only one of them is about the shop's board being empty.
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
  const [view, setView] = useCatalogueView();
  const [query, setQuery] = useState<BoardQuery>(DEFAULT_BOARD_QUERY);
  const [page, setPage] = useState(1);
  /**
   * The cursor that opens each page, first one first.
   *
   * GRIDGO pages by an opaque cursor, so the phone cannot jump to page four —
   * but it can remember the way back, and that is all "Previous page" needs.
   */
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const listQuery = useMemo(
    () => toListQuery(query, cursors[page - 1] ?? null),
    [cursors, page, query],
  );
  const {
    listings,
    nextCursor,
    total,
    kindSource,
    catalog,
    services,
    loading,
    loaded,
    stale,
    notOpenYet,
    error,
    reload,
    dropListing,
  } = useBoard(listQuery, { trackKinds: true });
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  /** Any new question is a new first page; a cursor from the old one is junk. */
  const ask = useCallback((next: Partial<BoardQuery>) => {
    setQuery((current) => ({ ...current, ...next }));
    setCursors([null]);
    setPage(1);
    setNotice(null);
  }, []);

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
        setRemoveError(result.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : result.message);
      }
      setRemoving(false);
    },
    [dropListing, reload],
  );

  const hunting = isHunting(query);
  const narrowing = narrowingCount(query);
  const kinds = kindsWithListings(kindSource, catalog);
  const { from, to, pageCount } = pageWindow(page, total);

  const reduceMotion = useReducedMotion();
  /** The question this wall is answering, so a new answer can fade in. */
  const settledKey = `${query.q}|${query.kind}|${query.onBoard}|${query.sort}|${page}`;

  const firstLoad = loading && !loaded;
  // The wall still holds the answer to an older question. Say so with the
  // skeleton rather than leaving last question's samples up as this one's.
  const settling = loading && stale;
  const showSkeleton = firstLoad || settling;

  /**
   * Whether this shop has a board at all.
   *
   * The rail has to survive a hunt that found nothing — it is holding the field
   * the shop clears the hunt from. So the rail is drawn for a shop that owns
   * listings, not for a page that happens to have some on it. The kinds probe
   * is the record of that, topped up by every page loaded.
   */
  const hasBoard = kindSource.length > 0 || total > 0;

  async function pickKind() {
    const picked = await askPick({
      title: "Kind of work",
      options: [
        { value: "all", label: "All work" },
        ...kinds.map((entry) => ({ value: entry.code, label: entry.name })),
      ],
      selected: query.kind,
    });
    if (!picked) return;
    ask({ kind: picked });
  }

  async function pickSort() {
    const picked = await askPick({
      title: "Sort",
      options: CATALOGUE_SORTS.map((entry) => ({
        value: entry.value,
        label: entry.label,
        detail: entry.detail,
      })),
      selected: query.sort,
    });
    if (!picked) return;
    ask({ sort: picked as CatalogueSort });
  }

  return (
    <View className="gg-screen">
      <FormScrollView
        contentClassName="gg-page pb-16"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        <ScreenHeader
          title="Catalogues"
          right={
            <View className="flex-row items-center">
              <ChatButton />
              <AlertsBell />
            </View>
          }
        />

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

        {error && !hasBoard ? (
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

        {hasBoard ? (
          <View className="mt-8 gap-3">
            <BoardRail
              count={total}
              view={view}
              onViewChange={setView}
              kinds={kinds}
              query={query}
              onHunt={(value) => ask({ q: value })}
              onPickKind={() => void pickKind()}
              onOnBoardChange={(next) => ask({ onBoard: next })}
              onPickSort={() => void pickSort()}
              onAdd={() => router.push("/shop/new")}
            />
            {notice ? (
              <View className="gg-panel">
                <Text className="text-body text-text-secondary">{notice}</Text>
              </View>
            ) : null}
            {removeError ? <ErrorNotice message={removeError} /> : null}
          </View>
        ) : null}

        {showSkeleton ? (
          <View
            className={hasBoard ? "mt-3" : "mt-8"}
            accessibilityRole="progressbar"
            accessibilityLabel={hunting ? HUNTING_LABEL : "Loading your board"}
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

        {!showSkeleton && !notOpenYet && !error && !hasBoard ? (
          <View className="mt-8">
            <EmptyState
              title={EMPTY_BOARD_TITLE}
              body={EMPTY_BOARD_BODY}
              actionLabel="Put something on the board"
              onAction={() => router.push("/shop/new")}
            />
          </View>
        ) : null}

        {!showSkeleton && hasBoard ? (
          <View className="mt-3 gap-3">
            {listings.length === 0 && hunting ? (
              /*
                A hunt that found nothing is not an empty board, and the copy
                has to say which. The way out is a control, not a sentence the
                shop has to work out — but a charcoal one: the plus above it is
                the only yellow on this screen.
              */
              <View className="gg-card gap-3">
                <Text className="text-body text-text-secondary">{EMPTY_HUNT_SENTENCE}</Text>
                <SecondaryButton label="Clear the hunt" onPress={() => ask({ q: "" })} />
              </View>
            ) : listings.length === 0 && narrowing > 0 ? (
              <Text className="text-body text-text-secondary">{EMPTY_CUT_SENTENCE}</Text>
            ) : (
              <>
                {/*
                  A new answer arrives rather than appearing: the wall is the
                  result of what the shop just typed, and 160ms of fade is what
                  connects the two. Keyed on the question so a page that has not
                  changed does not blink. Reduced motion gets the answer alone.
                */}
                <Animated.View
                  key={settledKey}
                  entering={reduceMotion ? undefined : FadeIn.duration(motion.fast)}
                >
                  <Wall
                    listings={listings}
                    view={view}
                    hunt={query.q}
                    catalog={catalog}
                    services={services}
                    shopApproved={approved}
                    onRemove={removing ? undefined : remove}
                  />
                </Animated.View>
                <BoardPager
                  page={page}
                  pageCount={pageCount}
                  from={from}
                  to={to}
                  total={total}
                  hasNext={nextCursor != null}
                  onPrev={() => setPage((current) => Math.max(1, current - 1))}
                  onNext={() => {
                    if (!nextCursor) return;
                    setCursors((current) => [...current.slice(0, page), nextCursor]);
                    setPage((current) => current + 1);
                  }}
                />
              </>
            )}
          </View>
        ) : null}
      </FormScrollView>

      <BusyOverlay visible={removing} label="Removing this listing…" />
    </View>
  );
}

/** The shop's own order: a wall of samples, or a stack of quotes. */
function Wall({
  listings,
  view,
  hunt,
  catalog,
  services,
  shopApproved,
  onRemove,
}: {
  listings: Listing[];
  view: ReturnType<typeof useCatalogueView>[0];
  hunt: string;
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
            hunt={hunt}
            onPress={() =>
              router.push({
                pathname: "/shop/[id]",
                params: { id: listing.id },
              })
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
            hunt={hunt}
            onPress={() =>
              router.push({
                pathname: "/shop/[id]",
                params: { id: listing.id },
              })
            }
            onRemove={onRemove ? () => onRemove(listing) : undefined}
          />
        </View>
      ))}
    </View>
  );
}
