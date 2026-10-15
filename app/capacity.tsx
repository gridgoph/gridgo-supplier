import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { BusyOverlay } from "@/components/BusyOverlay";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ServiceCapacityCard } from "@/components/ServiceCapacityCard";
import { DestinationRow } from "@/components/listing/DestinationRow";
import { SkeletonList } from "@/components/Skeleton";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import {
  capacityDraftChanged,
  capacityPatch,
  capacityDraftFor,
  validateCapacity,
  type CapacityDraft,
} from "@/lib/capacity";
import { buildCatalog, type ServiceCatalog } from "@/lib/taxonomy";

/**
 * What the shop can take on. When it is open is Shop hours (`app/shop-hours.tsx`).
 */
export default function CapacityScreen() {

  const [{ services, drafts }, setCapacity] = useState<{
    services: api.SupplierService[];
    drafts: Record<string, CapacityDraft>;
  }>({ services: [], drafts: {} });
  const beginRead = useReadVersion();
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const reload = useCallback(async () => {
    const current = beginRead();
    setLoading(true);
    try {
      const [serviceList, taxonomy] = await Promise.all([
        api.listSupplierServices(),
        api.getTaxonomy().catch(() => null),
      ]);
      if (!current()) return;
      setCapacity((previous) => {
        if (previous.services.some((service) =>
          previous.drafts[service.id] && capacityDraftChanged(service, previous.drafts[service.id]),
        )) return previous;
        return {
          services: serviceList,
          drafts: Object.fromEntries(serviceList.map((s) => [s.id, capacityDraftFor(s)])),
        };
      });
      setCatalog(buildCatalog(taxonomy));
      setError(null);
    } catch (e) {
      if (!current()) return;
      setError(humanizeApiError(e, offlineMessage("load your capacity")));
    } finally {
      if (current()) setLoading(false);
    }
  }, [beginRead]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const changed = services.filter((s) => {
    const draft = drafts[s.id];
    return draft ? capacityDraftChanged(s, draft) : false;
  });
  useLiveRefresh(["availability", "services", "jobs", "settings"], () => {
    if (!saving && changed.length === 0) return reload();
  });
  const firstProblem = changed
    .map((s) => ({ id: s.id, problem: validateCapacity(drafts[s.id]) }))
    .find((entry) => entry.problem);

  async function saveAll() {
    if (firstProblem) {
      setSaveError(firstProblem.problem);
      return;
    }
    beginRead();
    setLoading(false);
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await Promise.all(
        changed.map((service) => api.updateSupplierService(service.id, capacityPatch(drafts[service.id]))),
      );
      setCapacity((current) => ({
        services: current.services.map((s) => updated.find((u) => u.id === s.id) ?? s),
        drafts: {
          ...current.drafts,
          ...Object.fromEntries(updated.map((s) => [s.id, capacityDraftFor(s)])),
        },
      }));
      setSaved(true);
    } catch (e) {
      setSaveError(humanizeApiError(e, offlineMessage("save your capacity")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">Capacity</Text>
          <Text className="text-body text-text-secondary">
            How much of each category you offer can go through the shop in a day and a week,
            and how fast you turn work around. GRIDGO matches jobs to you against these numbers.
          </Text>
        </View>

        {loading && !services.length ? (
          <View className="mt-6">
            <SkeletonList label="Loading the services you offer" count={2} />
          </View>
        ) : null}

        {error && !services.length ? (
          <View className="mt-6">
            <EmptyState
              title="Capacity is not reachable"
              body={error}
              actionLabel="Try again"
              onAction={() => void reload()}
            />
          </View>
        ) : error ? (
          // Saving is still the screen's one yellow action, so a refresh
          // failure states itself quietly rather than competing with it.
          <View className="mt-6">
            <ErrorNotice message={error} onRetry={() => void reload()} />
          </View>
        ) : null}

        {!loading && !error && !services.length ? (
          <View className="mt-6">
            <EmptyState
              title="Nothing to set capacity for"
              body="Capacity is set per service your shop offers. Pick what you produce first, then say how much of it you can turn out in a day."
              actionLabel="Choose your services"
              onAction={() => router.push("/services")}
              secondaryLabel="Check again"
              onSecondary={() => void reload()}
            />
          </View>
        ) : null}

        <View className="mt-6 gap-4">
          {services.map((service) => (
            <ServiceCapacityCard
              key={service.id}
              service={service}
              catalog={catalog}
              draft={drafts[service.id] ?? capacityDraftFor(service)}
              onChange={(patch) => {
                setSaved(false);
                setSaveError(null);
                setCapacity((current) => ({
                  ...current,
                  drafts: {
                    ...current.drafts,
                    [service.id]: {
                      ...(current.drafts[service.id] ?? capacityDraftFor(service)),
                      ...patch,
                    },
                  },
                }));
              }}
              error={firstProblem?.id === service.id ? firstProblem.problem : null}
              disabled={saving}
            />
          ))}
        </View>

        {saveError ? (
          <View className="mt-4">
            <ErrorNotice message={saveError} />
          </View>
        ) : null}

        {saved && !changed.length ? (
          <Text className="mt-4 text-caption text-success">
            Capacity saved. GRIDGO will match new work against it.
          </Text>
        ) : null}

        {/* Nothing changed, nothing to save — so no greyed-out yellow slab. */}
        {changed.length ? (
          <View className="mt-6">
            <PrimaryButton
              label={saving ? "Saving…" : "Save capacity"}
              disabled={saving}
              onPress={() => void saveAll()}
            />
          </View>
        ) : null}

        <View className="mt-10 gap-2">
          {/*
            Closures used to live here, on this phone only. GRIDGO holds them
            now, with the weekly hours they belong to.
          */}
          <DestinationRow
            title="Shop hours & closures"
            detail="The days and hours you open, closure dates, and closing for a while"
            onPress={() => router.push("/shop-hours")}
          />
        </View>
      </ScrollView>

      {/*
        One save can be several requests — one per changed service — so the
        screen stays put and says so rather than blanking into placeholders.
      */}
      <BusyOverlay visible={saving} label="Saving your capacity…" />
    </View>
  );
}
