import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";

import { BusyOverlay } from "@/components/BusyOverlay";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { StarterChoice } from "@/components/StarterChoice";
import { OptionList } from "@/components/controls/OptionList";
import { TextField } from "@/components/controls/TextField";
import {
  boardTargets,
  LISTING_CAPS,
  type ListingStarter,
} from "@/lib/listings";
import { BOARD_NOT_OPEN_YET, createListing, loadStarters } from "@/lib/listingsApi";
import { seedStarterSample } from "@/lib/starterSample";
import { useBoard } from "@/hooks/useBoard";

const BLANK = "__blank__";

/**
 * Putting something new on the board.
 *
 * Three decisions in the order a shop actually makes them: which of its
 * accredited categories this sits under, what kind of work it is, and whether
 * to start from GRIDGO's own steps for that work or from nothing. Only the
 * shop's own accredited categories are offered — accreditation is by category
 * and this screen cannot widen it.
 *
 * A starter is a copy, not a link: its steps, add-ons and example sample
 * become the shop's own the moment the listing exists, and the shop renames,
 * reprices, replaces or deletes any of them afterwards. That is the whole
 * point of offering one — a shop should not have to invent
 * "Size / Material / Finish" from a blank screen to sell a tarpaulin.
 */
export default function NewListingScreen() {
  const { catalog, services, loading, notOpenYet, error, reload } = useBoard();

  const targets = useMemo(() => boardTargets(catalog, services), [catalog, services]);
  const [categoryCode, setCategoryCode] = useState<string | null>(null);
  const [subcategoryCode, setSubcategoryCode] = useState<string | null>(null);
  const [starterId, setStarterId] = useState<string>(BLANK);
  const [starters, setStarters] = useState<ListingStarter[]>([]);
  const [startersLoading, setStartersLoading] = useState(false);
  const [starterError, setStarterError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // One accredited category is the common case, so it is chosen rather than
  // asked about — a list of one is a question with no answer.
  useEffect(() => {
    if (!categoryCode && targets.length === 1) setCategoryCode(targets[0].category.code);
  }, [categoryCode, targets]);

  const target = targets.find((entry) => entry.category.code === categoryCode) ?? null;

  useEffect(() => {
    setStarters([]);
    setStarterId(BLANK);
    setStarterError(null);
    if (!subcategoryCode) {
      setStartersLoading(false);
      return;
    }
    let cancelled = false;
    setStartersLoading(true);
    void (async () => {
      const result = await loadStarters(subcategoryCode);
      if (cancelled) return;
      setStartersLoading(false);
      if (result.status === "ok") {
        setStarters(result.value);
        setStarterId(result.value[0]?.id ?? BLANK);
        setStarterError(null);
        return;
      }
      setStarters([]);
      setStarterId(BLANK);
      setStarterError(result.status === "failed" ? result.message : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [subcategoryCode]);

  function retryStarters() {
    if (!subcategoryCode) return;
    setStarterError(null);
    setStartersLoading(true);
    void (async () => {
      const result = await loadStarters(subcategoryCode);
      setStartersLoading(false);
      if (result.status === "ok") {
        setStarters(result.value);
        setStarterId(result.value[0]?.id ?? BLANK);
        setStarterError(null);
        return;
      }
      setStarters([]);
      setStarterId(BLANK);
      setStarterError(result.status === "failed" ? result.message : null);
    })();
  }

  async function create() {
    if (!target || !subcategoryCode) return;
    setSaving(true);
    setSaveError(null);
    const chosenStarter = starterId === BLANK ? null : starterId;
    const result = await createListing({
      serviceLineId: target.service.id,
      subcategoryCode,
      name: name.trim(),
      starterId: chosenStarter,
    });

    if (result.status !== "ok") {
      setSaving(false);
      setSaveError(result.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : result.message);
      return;
    }

    // SAMPLE PHOTOS only knows uploaded files. Copy the starter's example
    // onto the listing before the editor opens so the shop is not staring at
    // an empty frame they already chose a picture for. A failed copy still
    // opens the listing — the shop can add a sample themselves.
    if (chosenStarter) {
      await seedStarterSample(chosenStarter, result.value.id);
    }
    setSaving(false);
    // Replace, so the back gesture from the editor lands on the board rather
    // than on a create screen that would open a second listing.
    router.replace({ pathname: "/shop/[id]", params: { id: result.value.id } });
  }

  if (loading && !catalog) {
    return (
      <View
        className="gg-screen gg-page pt-4"
        accessibilityRole="progressbar"
        accessibilityLabel="Loading what you are accredited for"
      >
        <SkeletonBlock className="h-5 w-2/3" />
        <View className="mt-6 gap-3">
          <SkeletonBlock className="h-16 w-full rounded-field" />
          <SkeletonBlock className="h-16 w-full rounded-field" />
        </View>
      </View>
    );
  }

  if (notOpenYet) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="Your board is not open yet"
          body={BOARD_NOT_OPEN_YET}
          actionLabel="Check again"
          onAction={() => void reload()}
        />
      </View>
    );
  }

  if (!targets.length) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="Say what your shop produces first"
          body="A listing sits under one of the categories your shop is accredited for, so there is nothing to file this against yet. Open Services you offer and pick the work you do."
          actionLabel="Open services you offer"
          onAction={() => router.replace("/services")}
        />
      </View>
    );
  }

  const ready = Boolean(target && subcategoryCode && name.trim());

  return (
    <View className="gg-screen">
      <FormScrollView contentClassName="gg-page pb-16 pt-4">
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">Add a listing</Text>
          <Text className="text-body text-text-secondary">
            One listing is one thing you sell. A tarpaulin and a stack of flyers are two
            listings — sizes, materials and finishes are steps inside one.
          </Text>
        </View>

        {error ? (
          <View className="mt-6">
            <ErrorNotice message={error} onRetry={() => void reload()} />
          </View>
        ) : null}

        {targets.length > 1 ? (
          <View className="mt-8 gap-3">
            <Text className="text-overline text-text-muted">WHICH OF YOUR CATEGORIES</Text>
            <OptionList
              options={targets.map((entry) => ({
                value: entry.category.code,
                label: entry.category.name,
                detail: entry.category.bestFor,
              }))}
              value={categoryCode}
              onChange={(value) => {
                setCategoryCode(value);
                setSubcategoryCode(null);
              }}
              accessibilityLabel="Which category this listing sits under"
            />
          </View>
        ) : null}

        {target ? (
          <View className="mt-8 gap-3">
            <Text className="text-overline text-text-muted">WHAT KIND OF WORK</Text>
            <OptionList
              options={target.covers.map((cover) => ({
                value: cover.code,
                label: cover.name,
                detail: cover.examples,
              }))}
              value={subcategoryCode}
              onChange={setSubcategoryCode}
              accessibilityLabel="What kind of work this listing is"
            />
          </View>
        ) : null}

        {subcategoryCode ? (
          <View className="mt-8 gap-3">
            <Text className="text-overline text-text-muted">WHERE TO START</Text>
            {startersLoading ? (
              <View
                accessibilityRole="progressbar"
                accessibilityLabel="Loading GRIDGO starters"
                className="gap-2"
              >
                <SkeletonBlock className="h-24 w-full rounded-field" />
                <SkeletonBlock className="h-16 w-full rounded-field" />
              </View>
            ) : (
              <StarterChoice
                starters={starters}
                value={starterId}
                blankValue={BLANK}
                onChange={setStarterId}
              />
            )}
            {starterError ? (
              <ErrorNotice message={starterError} onRetry={() => void retryStarters()} />
            ) : null}
            {starters.length ? (
              <Text className="text-caption text-text-muted">
                A starter is copied into your listing. Rename, reprice or delete anything in it
                afterwards — it stays yours.
              </Text>
            ) : null}
          </View>
        ) : null}

        {subcategoryCode ? (
          <View className="mt-8 gap-3">
            <Text className="text-overline text-text-muted">WHAT CLIENTS WILL CALL IT</Text>
            <TextField
              value={name}
              onChange={(value) => setName(value.slice(0, LISTING_CAPS.nameChars))}
              placeholder="Tarpaulin, 13oz"
              accessibilityLabel="Listing name"
              kind="text"
              returnKeyType="done"
              onSubmit={() => (ready ? void create() : undefined)}
            />
            <Text className="text-caption text-text-muted">
              Name it the way a client would ask for it at your counter.
            </Text>
          </View>
        ) : null}

        {saveError ? (
          <View className="mt-6">
            <ErrorNotice message={saveError} />
          </View>
        ) : null}

        <View className="mt-8">
          <PrimaryButton
            label={saving ? "Opening…" : "Create listing"}
            disabled={!ready || saving}
            onPress={() => void create()}
          />
          <Text className="mt-3 text-caption text-text-muted">
            It starts hidden. Add your samples and price, then put it on the board.
          </Text>
        </View>
      </FormScrollView>

      <BusyOverlay visible={saving} label="Opening your listing…" />
    </View>
  );
}
