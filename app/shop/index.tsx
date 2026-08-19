import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ListingCard } from "@/components/ListingCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonBlock } from "@/components/Skeleton";
import {
  boardContextFor,
  boardBlockers,
  EMPTY_BOARD_BODY,
  EMPTY_BOARD_TITLE,
  type Listing,
} from "@/lib/listings";
import { BOARD_NOT_OPEN_YET } from "@/lib/listingsApi";
import { useBoard } from "@/hooks/useBoard";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import { isMatchable, useSession } from "@/store/session";

/**
 * The shop's board — a two-column wall of its own samples.
 *
 * A print shop's board is a wall, not a spreadsheet: a client picks by looking
 * at what came off this shop's machine. So the photo is the tile and everything
 * else is a caption, and the wall keeps the shop's own order rather than
 * reordering itself by anything clever. There is exactly one ranking in this
 * app and it belongs to the job floor.
 *
 * A shop still with Operations gets the whole screen. Approval requires a
 * finished listing, so making a waiting shop wait for the thing it is waiting
 * for would be the wrong door.
 */
export default function BoardScreen() {
  const colors = useThemeColors();
  const user = useSession((s) => s.user);
  const approved = isMatchable(user);
  const { listings, catalog, services, loading, loaded, notOpenYet, error, reload } = useBoard();
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  const firstLoad = loading && !loaded;
  const unfinished = listings.filter(
    (listing) => boardBlockers(listing, boardContextFor(listing, services)).length > 0,
  ).length;

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">Your board</Text>
          <Text className="text-body text-text-secondary">
            What clients see: your listings, your prices, your samples. GRIDGO still decides
            which shop a job goes to — this is what a client is choosing when it comes to you.
          </Text>
        </View>

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
          <>
            <View className="mt-8 gap-3">
              <SectionHeader
                title="LISTINGS"
                count={listings.length}
                hint={
                  unfinished
                    ? unfinished === 1
                      ? "One listing still needs something before it can go up."
                      : `${unfinished} listings still need something before they can go up.`
                    : "Tap one to change its price, samples or steps."
                }
              />
              <Wall
                listings={listings}
                catalog={catalog}
                services={services}
                shopApproved={approved}
              />
            </View>

            <View className="mt-6">
              <PrimaryButton
                label="Add a listing"
                onPress={() => router.push("/shop/new")}
              />
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** Two columns, in the shop's own order. */
function Wall({
  listings,
  catalog,
  services,
  shopApproved,
}: {
  listings: Listing[];
  catalog: ReturnType<typeof useBoard>["catalog"];
  services: ReturnType<typeof useBoard>["services"];
  shopApproved: boolean;
}) {
  return (
    <View className="-mx-1.5 flex-row flex-wrap">
      {listings.map((listing) => (
        <View key={listing.id} className="w-1/2 px-1.5 pb-3">
          <ListingCard
            listing={listing}
            catalog={catalog}
            services={services}
            shopApproved={shopApproved}
            onPress={() =>
              router.push({ pathname: "/shop/[id]", params: { id: listing.id } })
            }
          />
        </View>
      ))}
    </View>
  );
}
