import { Star } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { OrderReference } from "@/components/OrderReference";
import { SkeletonList } from "@/components/Skeleton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { formatStars, standingLine, starWord, whyMatchingWaits } from "@/lib/reviews";

/**
 * What clients said, and where that puts the shop.
 *
 * Two facts lead, because they are the two a shop opens this for: the one
 * number clients gave it, and its place among every other shop on GRIDGO.
 * Everything under them is the evidence — the three stars broken out, the
 * standing in each kind of work, and then every rated job with its note.
 *
 * Reviews are never signed. The client was told nobody would see who left
 * it, and a shop that could work out which customer wrote "a day late" would
 * be a shop that could take it up with them. So a review points at the job,
 * never at the person.
 */
export default function ReviewsScreen() {
  const colors = useThemeColors();
  const [data, setData] = useState<api.MyReviews | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.getMyReviews());
    } catch (caught) {
      setError(caught instanceof api.ApiError
        ? humanizeApiError(caught, "Could not load your reviews. Pull down to try again.")
        : offlineMessage("Your reviews did not load"));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useLiveRefresh(["orders", "jobs"], load);
  const { refreshing, onRefresh } = usePullToRefresh(load);

  const summary = data?.summary;
  const ranking = data?.ranking;

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-10"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading && !data ? (
          <SkeletonList count={3} label="Loading your reviews" />
        ) : error && !data ? (
          <EmptyState
            title="Reviews did not load"
            body={error}
            actionLabel="Try again"
            onAction={() => {
              setLoading(true);
              void load();
            }}
          />
        ) : !summary || !ranking ? null : summary.count === 0 ? (
          <EmptyState
            title="No reviews yet"
            body="Clients rate a job for quality, speed and value once it is finished. Your first review puts you on the board against every other shop on GRIDGO."
          />
        ) : (
          <>
            {/*
              The standing card. One big number, the word for it, and the
              place — the memorable thing on the screen, so everything below
              can stay quiet.
            */}
            <View className="gg-card gap-4" accessible accessibilityLabel={standingLine(summary, ranking)}>
              <View className="flex-row items-end justify-between gap-4">
                <View className="min-w-0 flex-1">
                  <Text className="text-caption text-text-muted">Clients gave you</Text>
                  <View className="flex-row items-baseline gap-2">
                    <Text className="text-display text-text-primary">{formatStars(summary.overall)}</Text>
                    <Text className="text-body text-text-muted">out of 5</Text>
                  </View>
                  <Text className="text-body text-text-secondary">
                    {starWord(summary.overall)} · {summary.count === 1 ? "1 review" : `${summary.count} reviews`}
                  </Text>
                </View>
                <StarRow value={summary.overall ?? 0} size={18} />
              </View>

              <View className="gg-divider" />

              <View className="gap-1">
                {ranking.position != null ? (
                  <View className="flex-row items-baseline gap-2">
                    <Text className="text-h1 text-text-primary">#{ranking.position}</Text>
                    <Text className="text-body text-text-secondary">
                      of {ranking.of === 1 ? "1 shop" : `${ranking.of} shops`} on GRIDGO
                    </Text>
                  </View>
                ) : (
                  <Text className="text-body text-text-secondary">Not ranked yet.</Text>
                )}
                <Text className="text-caption text-text-muted">
                  Ranked by the average of quality, speed and value across every rated job.
                </Text>
              </View>
            </View>

            {/* The three stars broken out, plus the date record they sit beside. */}
            <View className="mt-6 gap-2">
              <Text className="text-overline text-text-muted">BY FACTOR</Text>
              <View className="gg-card gap-4">
                <FactorBar label="Quality" hint="The print itself" value={summary.quality} />
                <FactorBar label="Speed" hint="Delivered by the promised date" value={summary.speed} />
                <FactorBar label="Value" hint="Worth what the client paid" value={summary.value} />
                {summary.onTime && summary.onTime.count > 0 ? (
                  <>
                    <View className="gg-divider" />
                    <View className="flex-row items-baseline justify-between gap-3">
                      <View className="min-w-0 flex-1">
                        <Text className="text-body text-text-primary">On time</Text>
                        <Text className="text-caption text-text-muted">
                          Measured from your own ready-by date, not the client&apos;s deadline.
                        </Text>
                      </View>
                      <Text className="text-body font-medium text-text-primary">
                        {Math.round(summary.onTime.rate * summary.onTime.count)} of {summary.onTime.count}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>
              {summary.reviewsUntilMatching > 0 ? (
                <Text className="text-caption text-text-muted">{whyMatchingWaits(summary.reviewsUntilMatching)}</Text>
              ) : (
                <Text className="text-caption text-text-muted">
                  GRIDGO now matches jobs to you on your quality stars.
                </Text>
              )}
            </View>

            {ranking.byCategory.length ? (
              <View className="mt-6 gap-2">
                <Text className="text-overline text-text-muted">WHERE YOU RANK</Text>
                <View className="gg-card gap-3">
                  {ranking.byCategory.map((standing, index) => (
                    <View key={standing.categoryCode}>
                      {index > 0 ? <View className="gg-divider mb-3" /> : null}
                      <View className="flex-row items-center justify-between gap-3">
                        <View className="min-w-0 flex-1 gap-0.5">
                          <Text className="text-body text-text-primary" numberOfLines={1}>
                            {standing.categoryName}
                          </Text>
                          <Text className="text-caption text-text-muted">
                            {formatStars(standing.overall)} from{" "}
                            {standing.count === 1 ? "1 review" : `${standing.count} reviews`}
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-h3 text-text-primary">
                            {standing.position != null ? `#${standing.position}` : "—"}
                          </Text>
                          <Text className="text-caption text-text-muted">
                            of {standing.of}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View className="mt-6 gap-2">
              <Text className="text-overline text-text-muted">WHAT CLIENTS SAID</Text>
              <View className="gap-2">
                {data?.reviews.map((review) => (
                  <Pressable
                    key={review.id}
                    onPress={() => router.push({ pathname: "/job/[id]", params: { id: review.orderId } })}
                    accessibilityRole="button"
                    accessibilityLabel={`Review of job ${review.itemName ?? ""}, ${formatStars(reviewMean(review))} out of 5. Open the job.`}
                    className="gg-card gap-3"
                    style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="min-w-0 flex-1 gap-1">
                        <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
                          {review.itemName ?? review.subcategoryName ?? "Job"}
                        </Text>
                        <View className="flex-row flex-wrap items-center gap-2">
                          <OrderReference id={review.orderId} />
                          <Text className="text-caption text-text-muted">{formatReviewedOn(review.createdAt)}</Text>
                        </View>
                      </View>
                      <View className="items-end">
                        <Text className="text-h3 text-text-primary">{formatStars(reviewMean(review))}</Text>
                        <Text className="text-caption text-text-muted">of 5</Text>
                      </View>
                    </View>
                    <View className="gap-1.5">
                      <MiniStars label="Quality" stars={review.qualityStars} />
                      <MiniStars label="Speed" stars={review.speedStars} />
                      <MiniStars label="Value" stars={review.valueStars} />
                    </View>
                    {review.comment ? (
                      <Text className="text-body text-text-secondary">“{review.comment}”</Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );

  function StarRow({ value, size }: { value: number; size: number }) {
    return (
      <View className="flex-row items-center gap-0.5" accessibilityElementsHidden importantForAccessibility="no">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= Math.round(value);
          return (
            <Star
              key={star}
              size={size}
              color={filled ? colors.actionYellow : colors.textMuted}
              fill={filled ? colors.actionYellow : "transparent"}
              strokeWidth={1.5}
            />
          );
        })}
      </View>
    );
  }

  function MiniStars({ label, stars }: { label: string; stars: number }) {
    return (
      <View className="flex-row items-center gap-3" accessible accessibilityLabel={`${label}: ${stars} of 5`}>
        <Text className="w-16 text-caption text-text-muted">{label}</Text>
        <StarRow value={stars} size={14} />
        <Text className="text-caption text-text-secondary">{starWord(stars)}</Text>
      </View>
    );
  }

  function FactorBar({ label, hint, value }: { label: string; hint: string; value: number | null }) {
    const share = value == null ? 0 : Math.max(0, Math.min(1, value / 5));
    return (
      <View className="gap-1.5" accessible accessibilityLabel={`${label}: ${formatStars(value)} out of 5`}>
        <View className="flex-row items-baseline justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-body text-text-primary">{label}</Text>
            <Text className="text-caption text-text-muted">{hint}</Text>
          </View>
          <Text className="text-body font-medium text-text-primary">{formatStars(value)}</Text>
        </View>
        <View className="h-1.5 overflow-hidden rounded-pill bg-surface-variant">
          <View
            className="h-full rounded-pill"
            style={{ width: `${Math.round(share * 100)}%`, backgroundColor: colors.actionYellow }}
          />
        </View>
      </View>
    );
  }
}

function reviewMean(review: api.ShopReview): number {
  return (review.qualityStars + review.speedStars + review.valueStars) / 3;
}

/** The day the client rated it, in Davao time. */
function formatReviewedOn(createdAt: string): string {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return "";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(parsed));
}
