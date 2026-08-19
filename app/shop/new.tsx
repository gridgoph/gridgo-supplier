import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";

import { BusyOverlay } from "@/components/BusyOverlay";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { OptionList } from "@/components/controls/OptionList";
import { TextField } from "@/components/controls/TextField";
import {
  boardTargets,
  LISTING_CAPS,
  type ListingStarter,
} from "@/lib/listings";
import { BOARD_NOT_OPEN_YET, createListing, loadStarters } from "@/lib/listingsApi";
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
 * A starter is a copy, not a link: its steps and add-ons become the shop's own
 * rows the moment the listing exists, and the shop renames, reprices or deletes
 * any of them afterwards. That is the whole point of offering one — a shop
 * should not have to invent "Size / Material / Finish" from a blank screen to
 * sell a tarpaulin.
 */
export default function NewListingScreen() {
  const { catalog, services, loading, notOpenYet, error, reload } = useBoard();

  const targets = useMemo(() => boardTargets(catalog, services), [catalog, services]);
  const [categoryCode, setCategoryCode] = useState<string | null>(null);
  const [subcategoryCode, setSubcategoryCode] = useState<string | null>(null);
  const [starterId, setStarterId] = useState<string>(BLANK);
  const [starters, setStarters] = useState<ListingStarter[]>([]);
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
    if (!subcategoryCode) return;
    let cancelled = false;
    void (async () => {
      const found = await loadStarters(subcategoryCode);
      if (!cancelled) setStarters(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [subcategoryCode]);

  async function create() {
    if (!target || !subcategoryCode) return;
    setSaving(true);
    setSaveError(null);
    const result = await createListing({
      serviceLineId: target.service.id,
      subcategoryCode,
      name: name.trim(),
      starterId: starterId === BLANK ? null : starterId,
    });
    setSaving(false);

    if (result.status === "ok") {
      // Replace, so the back gesture from the editor lands on the board rather
      // than on a create screen that would open a second listing.
      router.replace({ pathname: "/shop/[id]", params: { id: result.value.id } });
      return;
    }
    setSaveError(result.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : result.message);
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
            <OptionList
              options={[
                ...starters.map((starter) => ({
                  value: starter.id,
                  label: `GRIDGO starter — ${starter.name}`,
                  detail: starterDetail(starter),
                })),
                {
                  value: BLANK,
                  label: "Start blank",
                  detail: "You add your own steps, add-ons and prices.",
                },
              ]}
              value={starterId}
              onChange={setStarterId}
              accessibilityLabel="Where to start this listing from"
            />
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

/** What a starter brings, so it can be chosen without opening it. */
function starterDetail(starter: ListingStarter): string {
  const parts: string[] = [];
  if (starter.specCount) {
    parts.push(starter.specCount === 1 ? "1 step" : `${starter.specCount} steps`);
  }
  if (starter.addOnCount) {
    parts.push(starter.addOnCount === 1 ? "1 add-on" : `${starter.addOnCount} add-ons`);
  }
  if (starter.turnaroundHours) parts.push(`ready in ${starter.turnaroundHours} hours`);
  return parts.length ? `Comes with ${parts.join(", ")}. All of it yours to change.` : "GRIDGO's own starting point for this work.";
}
