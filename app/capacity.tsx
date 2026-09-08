import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";

import { BusyOverlay } from "@/components/BusyOverlay";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ServiceCapacityCard } from "@/components/ServiceCapacityCard";
import { SkeletonList } from "@/components/Skeleton";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { blackoutReasonLabel, blackoutSpanLabel } from "@/lib/blackouts";
import {
  capacityDraftChanged,
  capacityDraftFor,
  validateCapacity,
  type CapacityDraft,
} from "@/lib/capacity";
import { buildCatalog, type ServiceCatalog } from "@/lib/taxonomy";
import { useShopPlan } from "@/store/shopPlan";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * What the shop can take on, and when it is shut.
 *
 * Capacity is real GRIDGO data and saves to the platform. Closures are not —
 * the API has no closure endpoint yet, so they are kept on this device and the
 * screen says so rather than implying Operations can see them.
 */
export default function CapacityScreen() {
  const colors = useThemeColors();
  const blackouts = useShopPlan((s) => s.blackouts);

  const [services, setServices] = useState<api.SupplierService[]>([]);
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CapacityDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [serviceList, taxonomy] = await Promise.all([
        api.listSupplierServices(),
        api.getTaxonomy().catch(() => null),
      ]);
      setServices(serviceList);
      setCatalog(buildCatalog(taxonomy));
      setDrafts(
        Object.fromEntries(serviceList.map((s) => [s.id, capacityDraftFor(s)])),
      );
      setError(null);
    } catch (e) {
      setError(humanizeApiError(e, offlineMessage("load your capacity")));
    } finally {
      setLoading(false);
    }
  }, []);

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
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await Promise.all(
        changed.map((service) => api.updateSupplierService(service.id, drafts[service.id])),
      );
      setServices((current) =>
        current.map((s) => updated.find((u) => u.id === s.id) ?? s),
      );
      setDrafts((current) => ({
        ...current,
        ...Object.fromEntries(updated.map((s) => [s.id, capacityDraftFor(s)])),
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
                setDrafts((current) => ({
                  ...current,
                  [service.id]: {
                    ...(current[service.id] ?? capacityDraftFor(service)),
                    ...patch,
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

        <View className="mt-10 gap-3">
          <Text className="text-h3 text-text-primary">Closures</Text>
          <Text className="text-body text-text-secondary">
            Days your shop is shut. Your schedule marks them and warns you before you promise a job
            on one.
          </Text>
          <View className="gg-panel">
            <Text className="text-caption text-text-secondary">
              Closures are saved on this device only. GRIDGO cannot route work around them yet, so
              tell Operations about a long shutdown as well.
            </Text>
          </View>

          {blackouts.length ? (
            <View className="gap-2">
              {blackouts.map((blackout) => (
                <Pressable
                  key={blackout.id}
                  onPress={() =>
                    router.push({ pathname: "/shop-closure", params: { id: blackout.id } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Edit closure ${blackoutSpanLabel(blackout)}`}
                  className="gg-touch flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3 py-3"
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                >
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-body font-medium text-text-primary">
                      {blackoutSpanLabel(blackout)}
                    </Text>
                    <Text className="text-caption text-text-muted" numberOfLines={1}>
                      {blackoutReasonLabel(blackout.reason)}
                      {blackout.note ? ` · ${blackout.note}` : ""}
                    </Text>
                  </View>
                  <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
                </Pressable>
              ))}
            </View>
          ) : (
            <Text className="text-caption text-text-muted">
              No closures set. Add one before a holiday so a job is never promised on a day you are
              shut.
            </Text>
          )}

          <SecondaryButton
            label="Add a closure"
            onPress={() => router.push("/shop-closure")}
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
