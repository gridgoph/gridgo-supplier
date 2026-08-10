import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SectionHeader } from "@/components/SectionHeader";
import { ServiceCategoryCard } from "@/components/ServiceCategoryCard";
import { SkeletonList } from "@/components/Skeleton";
import { StatTile } from "@/components/StatTile";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { catalogTotals, declarationsFor, submittableLineIds } from "@/lib/supplierServices";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * What this shop can produce.
 *
 * GRIDGO accredits a category at a time, so this screen is four decisions, not
 * seventeen — the work inside each one is on its own screen, where a shop can
 * read what it is committing to before saying yes. The counts say whose move
 * each declaration is waiting on, and the one yellow action hands every
 * unverified one to Operations at once.
 */
export default function ServicesScreen() {
  const colors = useThemeColors();
  const { catalog, services, setServices, loading, error, reload } = useServiceCatalog();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const declarations = useMemo(
    () => (catalog ? declarationsFor(catalog, services) : []),
    [catalog, services],
  );
  const totals = useMemo(
    () => (catalog ? catalogTotals(catalog, services) : null),
    [catalog, services],
  );
  const pending = useMemo(
    () => (catalog ? submittableLineIds(catalog, services) : []),
    [catalog, services],
  );

  async function submitAll() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const updated = await Promise.all(pending.map((id) => api.submitSupplierService(id)));
      setServices((current) =>
        current.map((line) => updated.find((u) => u.id === line.id) ?? line),
      );
    } catch (e) {
      setSubmitError(
        humanizeApiError(e, offlineMessage("send these to Operations")),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading && catalog != null}
            onRefresh={() => void reload()}
            tintColor={colors.textMuted}
          />
        }
      >
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">Services you offer</Text>
          <Text className="text-body text-text-secondary">
            GRIDGO only sends you work your shop has said it can produce. Operations verifies
            each category before it starts routing jobs to you.
          </Text>
        </View>

        {totals ? (
          <View className="mt-6 flex-row gap-3">
            <StatTile label="Verified" value={totals.verified} />
            <StatTile label="With Operations" value={totals.submitted} />
            <StatTile label="Not sent yet" value={totals.drafts} />
          </View>
        ) : null}

        {loading && !catalog ? (
          <View className="mt-8">
            <SkeletonList label="Loading the GRIDGO catalogue" count={3} compact />
          </View>
        ) : null}

        {error && !catalog ? (
          <View className="mt-6">
            <EmptyState
              title="The catalogue is not reachable"
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

        {catalog && catalog.source === "published" ? (
          <View className="gg-panel mt-6 gap-1">
            <Text className="text-body font-medium text-text-primary">
              GRIDGO has not published this catalogue yet
            </Text>
            <Text className="text-body text-text-secondary">
              {catalog.canDeclare
                ? "You can pick what you produce now. Each choice is filed against the closest line GRIDGO has until the full catalogue is live, so check it once that happens."
                : "You can read what is coming, but nothing can be filed against your shop yet. Check back shortly."}
            </Text>
          </View>
        ) : null}

        {declarations.length ? (
          <View className="mt-8 gap-3">
            <SectionHeader
              title="CATEGORIES"
              count={declarations.length}
              hint="Open one to see the work inside it and what you can produce."
            />
            <View className="gap-3">
              {declarations.map((declaration) => (
                <ServiceCategoryCard
                  key={declaration.category.code}
                  declaration={declaration}
                  onPress={() =>
                    router.push({
                      pathname: "/services/[category]",
                      params: { category: declaration.category.code },
                    })
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        {submitError ? (
          <View className="mt-6">
            <ErrorNotice message={submitError} />
          </View>
        ) : null}

        {pending.length ? (
          <View className="mt-8 gap-3">
            <Text className="text-body text-text-secondary">
              Operations checks your shop can produce each category before GRIDGO routes jobs to
              it. You can keep working while they do.
            </Text>
            <PrimaryButton
              label={
                submitting
                  ? "Sending…"
                  : pending.length === 1
                    ? "Submit 1 category for verification"
                    : `Submit ${pending.length} categories for verification`
              }
              disabled={submitting}
              onPress={() => void submitAll()}
            />
          </View>
        ) : totals && totals.offered === 0 && catalog?.canDeclare ? (
          <Text className="mt-8 text-body text-text-secondary">
            Nothing is offered yet, so GRIDGO has no work to send you. Open a category above and
            say what your shop actually produces.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
