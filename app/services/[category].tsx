import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";

import { ChipMultiSelect } from "@/components/ChipMultiSelect";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonBlock, SkeletonList } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { FieldShell } from "@/components/controls/FieldShell";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import {
  capabilityChanged,
  capabilityDraftFor,
  declarationFor,
  expandsCapability,
  presentLifecycle,
  toggleCode,
  type CapabilityDraft,
} from "@/lib/supplierServices";
import { findCategory } from "@/lib/taxonomy";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";
import { askConfirm } from "@/store/sheets";

/**
 * One category: what it covers, and what this shop can produce inside it.
 *
 * GRIDGO accredits the category as one line, so offering it is a single
 * decision — and the list of work it covers is right there, in the catalogue's
 * own words, so that decision is made with the whole of it in view rather than
 * as seventeen separate ticks.
 *
 * The refinement underneath is the part that changes which jobs actually
 * arrive: matching checks a job's material against this line, so a shop that
 * prints tarpaulin but not mesh says so here instead of declining the work
 * later.
 */
export default function ServiceCategoryScreen() {
  const { category: categoryCode } = useLocalSearchParams<{ category: string }>();
  const navigation = useNavigation();
  const { catalog, services, setServices, loading, error, reload } = useServiceCatalog();

  const category = useMemo(
    () => (catalog ? findCategory(catalog, categoryCode) : null),
    [catalog, categoryCode],
  );
  const declaration = useMemo(
    () => (catalog && category ? declarationFor(catalog, category, services) : null),
    [catalog, category, services],
  );
  const line = declaration?.line ?? null;

  const [draft, setDraft] = useState<CapabilityDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (category) navigation.setOptions({ title: category.name });
  }, [category, navigation]);

  // Seed the refinement from the saved line, once it arrives.
  useEffect(() => {
    if (!declaration || draft != null) return;
    setDraft(capabilityDraftFor(declaration.line));
  }, [declaration, draft]);

  const capability = draft ?? capabilityDraftFor(line);
  const dirty = declaration?.offered === true && capabilityChanged(line, capability);
  const widening =
    dirty && declaration?.lifecycle === "verified" && expandsCapability(line, capability);
  const status = declaration?.offered && declaration.lifecycle
    ? presentLifecycle(declaration.lifecycle)
    : null;

  async function refresh() {
    const fresh = await api.listSupplierServices();
    setServices(fresh);
    return fresh;
  }

  async function offerCategory() {
    if (!category) return;
    setBusy(true);
    setSaveError(null);
    try {
      if (line) await api.submitSupplierService(line.id);
      else await api.createSupplierService(category.code);
      setDraft(null);
      await refresh();
    } catch (e) {
      setSaveError(humanizeApiError(e, offlineMessage("offer this category")));
    } finally {
      setBusy(false);
    }
  }

  async function stopOffering() {
    if (!category || !line) return;
    const confirmed = await askConfirm({
      question: `Stop offering ${category.name}?`,
      consequence:
        "GRIDGO stops matching new jobs in this category to your shop straight away. Jobs already on your floor are unaffected, and Operations verifies it again if you bring it back.",
      confirmLabel: "Stop offering it",
      cancelLabel: "Keep offering it",
      destructive: true,
    });
    if (!confirmed) return;

    setBusy(true);
    setSaveError(null);
    try {
      await api.withdrawSupplierService(line.id);
      setDraft(null);
      await refresh();
    } catch (e) {
      setSaveError(humanizeApiError(e, offlineMessage("stop offering this category")));
    } finally {
      setBusy(false);
    }
  }

  async function saveCapability() {
    if (!line) return;
    if (widening) {
      const confirmed = await askConfirm({
        question: "Send this back to Operations?",
        consequence:
          "You are adding work this category was not verified for, so GRIDGO pauses matching until Operations checks it again. What you already offer stays as it is.",
        confirmLabel: "Save and send it back",
        cancelLabel: "Leave it as it is",
      });
      if (!confirmed) return;
    }

    setBusy(true);
    setSaveError(null);
    try {
      await api.updateSupplierService(line.id, {
        materialCodes: capability.materialCodes,
        finishCodes: capability.finishCodes,
      });
      setDraft(null);
      await refresh();
    } catch (e) {
      setSaveError(humanizeApiError(e, offlineMessage("save what you can produce")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16 pt-4"
        showsVerticalScrollIndicator={false}
      >
        {loading && !catalog ? (
          <View className="gap-6">
            <SkeletonBlock className="h-5 w-3/4" />
            <SkeletonList label="Loading this category" variant="row" count={4} />
          </View>
        ) : null}

        {error && !catalog ? (
          <EmptyState
            title="This category is not reachable"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {!loading && catalog && !category ? (
          <EmptyState
            title="Not in the catalogue"
            body="GRIDGO no longer publishes this category. Go back to see what your shop can offer now."
            actionLabel="Reload the catalogue"
            onAction={() => void reload()}
          />
        ) : null}

        {category && declaration ? (
          <>
            {/*
              The header already carries the category name and keeps it there
              while the list scrolls, so repeating it here would be the same
              words twice with nothing between them.
            */}
            {category.bestFor ? (
              <Text className="text-body-lg text-text-secondary">{category.bestFor}</Text>
            ) : null}

            <View className="mt-6 gg-card gap-3">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-overline text-text-muted">YOUR SHOP</Text>
                {status ? (
                  <StatusChip tone={status.tone} icon={status.icon} label={status.label} />
                ) : (
                  <Text className="text-caption text-text-muted">Not offered</Text>
                )}
              </View>
              <Text className="text-body text-text-secondary">
                {status
                  ? status.detail
                  : "GRIDGO sends you nothing from this category. Offer it and Operations will check your shop can produce it."}
              </Text>
              {!category.declarable ? (
                <Text className="text-body text-text-secondary">
                  GRIDGO has not opened this category to shops yet, so there is nothing to
                  offer against. It will appear here as soon as it does.
                </Text>
              ) : declaration.offered ? (
                <SecondaryButton
                  label={busy ? "Working…" : "Stop offering this"}
                  disabled={busy}
                  onPress={() => void stopOffering()}
                />
              ) : (
                <PrimaryButton
                  label={busy ? "Working…" : "Offer this category"}
                  disabled={busy}
                  onPress={() => void offerCategory()}
                />
              )}
            </View>

            <View className="mt-8 gap-3">
              <SectionHeader
                title="WHAT THIS COVERS"
                count={category.covers.length}
                hint="Offering the category means GRIDGO may send you any of these."
              />
              <View className="gg-card-flush">
                {category.covers.map((item, index) => (
                  <View
                    key={item.code}
                    className={
                      index === 0
                        ? "gap-0.5 px-4 py-3"
                        : "gap-0.5 border-t border-outline-subtle px-4 py-3"
                    }
                  >
                    <Text className="text-body font-medium text-text-primary">
                      {item.name}
                    </Text>
                    {item.examples ? (
                      <Text className="text-caption text-text-muted">{item.examples}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>

            {declaration.offered && (category.materials.length || category.finishes.length) ? (
              <View className="mt-8 gap-4">
                <SectionHeader
                  title="WHAT YOU CAN PRODUCE"
                  hint="GRIDGO matches a job's material against this, so leave out anything you cannot run."
                />

                {category.materials.length ? (
                  <FieldShell label="Materials">
                    <ChipMultiSelect
                      options={category.materials.map((m) => ({
                        value: m.code,
                        label: m.name,
                      }))}
                      selected={capability.materialCodes}
                      onToggle={(code) =>
                        setDraft({
                          ...capability,
                          materialCodes: toggleCode(capability.materialCodes, code),
                        })
                      }
                      accessibilityLabel="Materials you can run"
                      disabled={busy}
                    />
                  </FieldShell>
                ) : null}

                {category.finishes.length ? (
                  <FieldShell label="Finishing">
                    <ChipMultiSelect
                      options={category.finishes.map((f) => ({
                        value: f.code,
                        label: f.name,
                      }))}
                      selected={capability.finishCodes}
                      onToggle={(code) =>
                        setDraft({
                          ...capability,
                          finishCodes: toggleCode(capability.finishCodes, code),
                        })
                      }
                      accessibilityLabel="Finishing you can do"
                      disabled={busy}
                    />
                  </FieldShell>
                ) : null}

                {saveError ? <ErrorNotice message={saveError} /> : null}

                {/*
                  With nothing changed there is nothing to save, so the action is
                  not drawn at all — a permanently greyed yellow button is a slab
                  that teaches a shop to stop looking at the one colour that
                  means "this is the thing to press".
                */}
                {dirty ? (
                  <View className="gap-2">
                    {widening ? (
                      <Text className="text-body text-warning">
                        This adds work Operations has not checked yet, so saving pauses matching
                        for this category until they look again.
                      </Text>
                    ) : null}
                    <PrimaryButton
                      label={busy ? "Saving…" : "Save what you can produce"}
                      disabled={busy}
                      onPress={() => void saveCapability()}
                    />
                  </View>
                ) : null}
              </View>
            ) : saveError ? (
              <View className="mt-6">
                <ErrorNotice message={saveError} />
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
