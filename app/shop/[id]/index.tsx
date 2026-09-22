import { Link2 } from "lucide-react-native";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BusyOverlay } from "@/components/BusyOverlay";
import { DangerButton } from "@/components/DangerButton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { AddGroupButton, SpecGroupEditor } from "@/components/SpecGroupEditor";
import { AddPrepStepButton, PrepStepRow } from "@/components/PrepStepEditor";
import { StatusChip } from "@/components/StatusChip";
import { ChipMultiSelect } from "@/components/ChipMultiSelect";
import { FormatPlusField } from "@/components/FormatPlusField";
import { MoneyField } from "@/components/controls/MoneyField";
import { NoteField } from "@/components/controls/NoteField";
import { OptionList } from "@/components/controls/OptionList";
import { DestinationRow } from "@/components/listing/DestinationRow";
import { ListingSection as Section } from "@/components/listing/ListingSection";
import { PrinterCapField } from "@/components/listing/PrinterCapField";
import { SampleStrip } from "@/components/listing/SampleStrip";
import { PriceTierEditor, SpeedTierEditor } from "@/components/listing/TierEditor";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { Stepper } from "@/components/controls/Stepper";
import { TextField } from "@/components/controls/TextField";
import { fileFormatName, linkFormatInvitation } from "@/data/fileFormats";
import { spacing } from "@/constants/theme";
import {
  applyDraft,
  draftFrom,
  formatsMoved,
  listingSavePatch,
  measureUnitFor,
  needsMeasure,
  packageQtyFor,
  PACK_STEP,
  sameDraft,
  type ListingDraft as Draft,
  unitHint,
} from "@/lib/listingDraft";
import {
  addOns,
  asksQuantity,
  boardContextFor,
  boardStanding,
  editorGuidance,
  gridgoNeeds,
  LISTING_CAPS,
  MEASURE_UNITS,
  unitLine,
  measurementKind,
  needsPrinterCap,
  PRICING_UNITS,
  priceLine,
  unitChoiceLabel,
  readyInLine,
  specs,
  subcategoryName,
  type Listing,
} from "@/lib/listings";
import {
  addGroup,
  addOption,
  addPrepStep,
  ARCHIVED_SENTENCE,
  BOARD_NOT_OPEN_YET,
  PREP_STEPS_NOT_OPEN_YET,
  removeGroup,
  removeListing,
  removeOption,
  removePhoto,
  removePrepStep,
  reorderPrepSteps,
  saveGroup,
  saveListing,
  setFileFormats,
  type BoardOutcome,
} from "@/lib/listingsApi";
import { linkFileOptions, uploadedFileOptions } from "@/lib/fileFormatResolve";
import { parseMoney } from "@/lib/money";
import { resolveCategoryCode } from "@/lib/taxonomy";
import { useAcceptedFileFormats } from "@/hooks/useAcceptedFileFormats";
import { routeId, useListing } from "@/hooks/useBoard";
import { useThemeColors } from "@/hooks/useTheme";
import { useListingWizard } from "@/store/listingWizard";
import { askConfirm } from "@/store/sheets";
import { isMatchable, useSession } from "@/store/session";

/**
 * One listing, in sections.
 *
 * Everything a shop changes about a listing is here rather than behind a
 * twelve-step wizard: a price change is one tap in, not a flow. Only the
 * samples and the client's-eye view get their own screens, because one is a
 * camera roll and the other is a different point of view.
 *
 * Two kinds of change live here and the copy says which is which. The words,
 * the price and the times are held until the foot is pressed — a half-typed
 * name must never be saved — and they are also saved on the way out, because
 * opening the preview to check a price that had never left the phone is exactly
 * how a shop concludes GRIDGO lost it. Steps, add-ons and their choices are
 * their own records on GRIDGO and save as they are added.
 */
export default function ListingScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = routeId(params.id);
  const insets = useSafeAreaInsets();
  const approved = isMatchable(useSession((s) => s.user));
  const formats = useAcceptedFileFormats();

  const [draft, storeDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The reload guard and the leaving-the-screen save both need to know whether
  // there are unsaved words, from callbacks that must not re-subscribe on every
  // keystroke — hence a ref beside the state rather than a second source.
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);

  const {
    listing,
    catalog,
    services,
    prepSteps,
    prepStepsOpen,
    loading,
    notOpenYet,
    error,
    reload,
  } = useListing(id, useCallback(() => dirtyRef.current, []));

  // Never null while a listing is loaded. Deriving it here rather than waiting
  // for an effect is what stops the screen rendering its "not reachable" state
  // for the frame between the listing arriving and the draft being seeded.
  const baseline = listing;
  const working = draft ?? (listing ? draftFrom(listing) : null);

  const dirty = Boolean(baseline && working && !sameDraft(working, draftFrom(baseline)));
  useLayoutEffect(() => { dirtyRef.current = dirty; });

  function setDraft(value: Draft | null) {
    const changed = Boolean(value && baseline && !sameDraft(value, draftFrom(baseline)));
    dirtyRef.current = changed;
    storeDraft(changed ? value : null);
  }

  const merged = useMemo(
    () => (listing && working ? applyDraft(listing, working) : listing),
    [listing, working],
  );
  const context = useMemo(
    () => (merged ? boardContextFor(merged, services) : null),
    [merged, services],
  );
  const blockers = merged && context ? gridgoNeeds(merged, context) : [];
  const extras = merged && context ? editorGuidance(merged, context) : [];
  const standing = merged && context ? boardStanding(merged, context, approved) : null;

  /** Every write goes through here, so one failure sentence has one home. */
  const run = useCallback(
    async <T,>(work: () => Promise<BoardOutcome<T>>, absent = BOARD_NOT_OPEN_YET) => {
      setBusy(true);
      setActionError(null);
      const result = await work();
      if (result.status === "ok") {
        await reload();
        setBusy(false);
        return true;
      }
      setActionError(result.status === "not_open_yet" ? absent : result.message);
      setBusy(false);
      return false;
    },
    [reload],
  );

  /**
   * Send the words, the price and the times.
   *
   * `onTheBoard` is passed only when the shop asked to change it; the formats
   * are their own route and only move when they moved.
   */
  const persist = useCallback(
    async (onTheBoard?: boolean): Promise<boolean> => {
      if (!baseline || !working) return false;
      const money = parseMoney(working.price);
      if (!money.ok) {
        setActionError(money.error);
        return false;
      }

      savingRef.current = true;
      setBusy(true);
      setActionError(null);
      try {
        const saved = await saveListing(
          baseline,
          listingSavePatch(working, money.minor ?? 0, onTheBoard),
        );
        if (saved.status !== "ok") {
          setActionError(saved.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : saved.message);
          return false;
        }
        dirtyRef.current = false;
        storeDraft(null);

        if (formatsMoved(working, baseline)) {
          const formatsSaved = await setFileFormats(
            saved.value,
            working.fileFormatMode,
            working.formatCodes,
          );
          if (formatsSaved.status !== "ok") {
            await reload();
            setActionError(
              formatsSaved.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : formatsSaved.message,
            );
            return false;
          }
        }
        await reload();
        return true;
      } finally {
        savingRef.current = false;
        setBusy(false);
      }
    },
    [baseline, reload, working],
  );

  /**
   * Leaving with unsaved words saves them.
   *
   * A shop that types a price and taps through to the preview is not asking to
   * throw the price away, and finding ₱0.00 on the other side reads as GRIDGO
   * losing it. Every route out of this screen goes through here first.
   */
  const persistThen = useCallback(
    async (go: () => void) => {
      if (dirtyRef.current && !savingRef.current) {
        if (!(await persist())) return;
      }
      go();
    },
    [persist],
  );

  async function takeOff() {
    if (!listing) return;
    const confirmed = await askConfirm(
      {
        question: `Take “${listing.name}” off the board?`,
        consequence:
          "Clients stop seeing it straight away. Nothing you have written is lost, and you can put it back up any time.",
        confirmLabel: "Take it off",
        cancelLabel: "Leave it up",
        destructive: true,
      },
      "/shop/confirm",
    );
    if (confirmed) await persist(false);
  }

  async function remove() {
    if (!listing) return;
    const confirmed = await askConfirm(
      {
        question: `Remove “${listing.name}” from your shop?`,
        consequence:
          "It comes off your board and its samples, steps and prices go with it. A listing a client has already ordered from is kept for that job's history instead.",
        confirmLabel: "Remove it",
        cancelLabel: "Keep it",
        destructive: true,
      },
      "/shop/confirm",
    );
    if (!confirmed) return;

    setBusy(true);
    setActionError(null);
    setNotice(null);
    const result = await removeListing(listing);

    if (result.status === "ok") {
      dirtyRef.current = false;
      useListingWizard.getState().forget(listing.id);
      if (result.value === "deleted") {
        // Leave the wait up until this screen is gone. Clearing it and
        // popping in the same moment crashed the project on Android.
        router.back();
        return;
      }
      // GRIDGO kept it because a job already used it. Saying "removed" and
      // sending the shop back to a board it is still on would be the lie.
      setNotice(ARCHIVED_SENTENCE);
      await reload();
      setBusy(false);
      return;
    }
    setBusy(false);
    setActionError(
      result.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : result.message,
    );
  }

  if (!id) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="This listing could not be opened"
          body="GRIDGO was not told which listing to open. Go back to your board and tap it again."
          actionLabel="Back to your board"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  if (loading && !listing) {
    return (
      <View
        className="gg-screen gg-page pt-4"
        accessibilityRole="progressbar"
        accessibilityLabel="Loading this listing"
      >
        <SkeletonBlock className="h-7 w-2/3" />
        <View className="mt-6 gap-4">
          <SkeletonBlock className="h-40 w-full rounded-card" />
          <SkeletonBlock className="h-12 w-full rounded-field" />
          <SkeletonBlock className="h-24 w-full rounded-field" />
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

  if (!listing || !working || !merged || !context || !standing) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="This listing did not load"
          body={
            error ??
            "GRIDGO did not answer for this listing. Check this phone's connection and try again."
          }
          actionLabel="Try again"
          onAction={() => void reload()}
        />
      </View>
    );
  }

  const category = catalog
    ? (catalog.categories.find((entry) =>
        entry.covers.some((cover) => cover.code === listing.subcategoryCode),
      ) ??
      catalog.categories.find(
        (entry) =>
          entry.code ===
          resolveCategoryCode(
            catalog,
            services.find((line) => line.id === listing.serviceLineId)?.categoryCode ?? "",
          ),
      ) ??
      null)
    : null;

  return (
    <View className="gg-screen">
      {/*
        The listing's own name in the header. "Listing" told a shop with eleven
        of them nothing at all, and the name is already the first thing it
        looked for. Nothing else is drawn up there — the platform's own controls
        share that bar.
      */}
      <Stack.Screen options={{ title: merged.name || "Untitled listing" }} />

      <FormScrollView contentClassName="gg-page pb-10 pt-4" bottomOffset={spacing.xxl}>
        <View className="gap-2">
          <Text className="text-body-lg font-medium text-text-primary">{priceLine(merged)}</Text>
          <View className="flex-row">
            <StatusChip tone={standing.tone} icon={standing.icon} label={standing.label} />
          </View>
          {standing.note ? (
            <Text className="text-body text-text-secondary">{standing.note}</Text>
          ) : null}
        </View>

        {/* 1. Samples */}
        <Section
          title="SAMPLE PHOTOS"
          hint={
            listing.photos.length
              ? "The first one is what clients see on your board."
              : "A listing cannot go on the board without one."
          }
        >
          <SampleStrip
            listing={listing}
            onRemove={(fileId) => {
              void (async () => {
                const confirmed = await askConfirm(
                  {
                    question: `Take this sample off “${listing.name || "this listing"}”?`,
                    consequence:
                      "It will no longer appear on this listing. You can add another sample afterwards.",
                    confirmLabel: "Remove",
                    cancelLabel: "Keep it",
                    destructive: true,
                  },
                  "/shop/confirm",
                );
                if (!confirmed) return;
                await run(async () => removePhoto(listing, fileId));
              })();
            }}
          />
          <DestinationRow
            title={listing.photos.length ? "Edit photos" : "Add a sample photo"}
            detail={`${listing.photos.length} of ${LISTING_CAPS.photos} used.`}
            onPress={() =>
              void persistThen(() =>
                router.push({ pathname: "/shop/[id]/photos", params: { id } }),
              )
            }
          />
        </Section>

        {/* 2. What it is */}
        <Section title="WHAT IT IS">
          <TextField
            value={working.name}
            onChange={(value) =>
              setDraft({ ...working, name: value.slice(0, LISTING_CAPS.nameChars) })
            }
            placeholder="Tarpaulin, 13oz"
            accessibilityLabel="Listing name"
            kind="text"
          />
          <NoteField
            value={working.description}
            onChange={(value) => setDraft({ ...working, description: value })}
            placeholder="What a client gets, in your own words."
            accessibilityLabel="What this listing is"
            maxLength={LISTING_CAPS.descriptionChars}
          />
          {category && category.covers.length > 1 ? (
            <View className="gap-2">
              <Text className="text-caption text-text-muted">
                Filed under {category.name}. You can move it within that category, not out of it.
              </Text>
              <OptionList
                options={category.covers.map((cover) => ({
                  value: cover.code,
                  label: cover.name,
                  detail: cover.examples,
                }))}
                value={working.subcategoryCode}
                onChange={(value) =>
                  setDraft({
                    ...working,
                    subcategoryCode: value,
                    printerMaxWidthFeet: needsPrinterCap(value)
                      ? working.printerMaxWidthFeet
                      : null,
                  })
                }
                accessibilityLabel="What kind of work this listing is"
              />
            </View>
          ) : (
            <Text className="text-caption text-text-muted">
              {subcategoryName(catalog, merged.subcategoryCode)}
            </Text>
          )}
          {needsPrinterCap(working.subcategoryCode) ? (
            <PrinterCapField
              value={working.printerMaxWidthFeet}
              onChange={(value) => setDraft({ ...working, printerMaxWidthFeet: value })}
            />
          ) : null}
        </Section>

        {/* 3. Price */}
        <Section
          title="PRICE"
          hint="Your own asking price. What GRIDGO charges the client on top is not yours to set."
        >
          {/*
            Six ways to sell something, as a list rather than a segmented row:
            the labels are too long to sit side by side, and the choice decides
            which questions a client is asked, so it is worth reading properly.
          */}
          <OptionList
            options={PRICING_UNITS.map((unit) => ({
              value: unit,
              label: unitChoiceLabel(unit),
              hint: unitHint(unit),
            }))}
            value={working.pricingUnit}
            onChange={(value) =>
              setDraft({
                ...working,
                pricingUnit: value,
                measureUnit: measureUnitFor(value, working.measureUnit),
                packageQty: packageQtyFor(value, working.packageQty),
              })
            }
            accessibilityLabel="How this listing is priced"
          />
          <MoneyField
            value={working.price}
            onChange={(value) => setDraft({ ...working, price: value })}
            accessibilityLabel="Your price"
          />

          {working.pricingUnit === "per_package" ? (
            <View className="gap-2">
              <Text className="text-caption text-text-muted">How many pieces in a pack</Text>
              <Stepper
                value={working.packageQty ?? 100}
                onChange={(value) => setDraft({ ...working, packageQty: value })}
                min={2}
                max={5000}
                step={PACK_STEP}
                unit="pieces"
                accessibilityLabel="Pieces in a pack"
              />
            </View>
          ) : null}

          {needsMeasure(working.pricingUnit) ? (
            <View className="gap-2">
              <Text className="text-caption text-text-muted">What you measure in</Text>
              <SegmentedControl
                options={MEASURE_UNITS.map((unit) => ({ value: unit, label: unit }))}
                value={working.measureUnit ?? "ft"}
                onChange={(value) => setDraft({ ...working, measureUnit: value })}
                accessibilityLabel="Measurement unit"
              />
            </View>
          ) : null}

          {/*
            The smallest job worth setting up. Waste is the same on a small one,
            and without this a shop is underpaid on every one of them.
          */}
          {measurementKind(working.pricingUnit) === "area" ? (
            <View className="gap-2">
              <Text className="text-caption text-text-muted">
                Smallest size you charge for — optional
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Stepper
                    value={working.minimumWidth ?? 0}
                    onChange={(value) => setDraft({ ...working, minimumWidth: value || null })}
                    min={0}
                    max={100}
                    step={1}
                    unit={`${working.measureUnit ?? "ft"} wide`}
                    accessibilityLabel="Smallest billable width"
                  />
                </View>
                <View className="flex-1">
                  <Stepper
                    value={working.minimumHeight ?? 0}
                    onChange={(value) => setDraft({ ...working, minimumHeight: value || null })}
                    min={0}
                    max={100}
                    step={1}
                    unit={`${working.measureUnit ?? "ft"} tall`}
                    accessibilityLabel="Smallest billable height"
                  />
                </View>
              </View>
            </View>
          ) : null}

          {measurementKind(working.pricingUnit) === "length" ? (
            <View className="gap-2">
              <Text className="text-caption text-text-muted">
                Shortest you charge for — optional
              </Text>
              <Stepper
                value={working.minimumLength ?? 0}
                onChange={(value) => setDraft({ ...working, minimumLength: value || null })}
                min={0}
                max={100}
                step={1}
                unit={working.measureUnit ?? "ft"}
                accessibilityLabel="Shortest billable length"
              />
            </View>
          ) : null}

          {asksQuantity(working.pricingUnit) ? (
            <PriceTierEditor
              tiers={working.priceTiers}
              unitLabel={unitLine(merged)}
              onChange={(next) => setDraft({ ...working, priceTiers: next })}
            />
          ) : null}

          {asksQuantity(working.pricingUnit) ? (
            <View className="gap-2">
              <Text className="text-caption text-text-muted">
                Least you will run — optional
              </Text>
              <Stepper
                value={working.minimumOrderQuantity ?? 0}
                onChange={(value) => setDraft({ ...working, minimumOrderQuantity: value || null })}
                min={0}
                max={1000}
                step={1}
                unit={working.minimumOrderQuantity ? "minimum" : "no minimum"}
                accessibilityLabel="Smallest order you will take"
              />
            </View>
          ) : null}
        </Section>

        {/* 4. Ready in */}
        <Section title="READY IN">
          <SegmentedControl
            options={[
              { value: "inherit", label: "Your usual time" },
              { value: "override", label: "Just this listing" },
            ]}
            value={working.turnaroundMode}
            onChange={(value) => setDraft({ ...working, turnaroundMode: value })}
            accessibilityLabel="How long this listing takes"
          />
          <SpeedTierEditor
            tiers={working.speedTiers}
            onChange={(next) => setDraft({ ...working, speedTiers: next })}
          />
          {working.turnaroundMode === "override" ? (
            <Stepper
              value={working.turnaroundHours ?? 24}
              onChange={(value) => setDraft({ ...working, turnaroundHours: value })}
              min={1}
              max={336}
              step={1}
              unit="hours"
              accessibilityLabel="Hours this listing takes"
            />
          ) : (
            <Text className="text-caption text-text-muted">
              {context.inheritedTurnaroundHours
                ? `${readyInLine(context.inheritedTurnaroundHours)}, the time on your accreditation for this category.`
                : "Your shop has no usual time on this category yet. Set the hours here, or add one in Services you offer."}
            </Text>
          )}
        </Section>

        {/* 5. Steps */}
        <Section
          title="WHAT A CLIENT PICKS"
          hint="In this order, the way they will see it. Each one saves as you add it."
        >
          {specs(merged).map((group, index) => (
            <SpecGroupEditor
              key={group.id}
              group={group}
              step={index + 1}
              busy={busy}
              onSetRequired={(required) => {
                void run(async () => saveGroup(listing, group, { required }));
              }}
              onAddOption={(label, minor, multiplier) =>
                run(async () =>
                  addOption(group, {
                    label,
                    priceModifierMinor: minor,
                    priceMultiplierBps: multiplier,
                  }),
                )
              }
              onRemoveOption={(optionId) => {
                void run(async () => removeOption(group, optionId));
              }}
              onRemoveGroup={() => {
                void run(async () => removeGroup(listing, group));
              }}
            />
          ))}
          {merged.groups.length < LISTING_CAPS.specGroups ? (
            <AddGroupButton
              kind="spec"
              busy={busy}
              onAdd={(input) =>
                run(async () =>
                  addGroup(listing, {
                    name: input.name,
                    kind: "spec",
                    required: true,
                    firstOption: input.firstOption,
                  }),
                )
              }
            />
          ) : (
            <Text className="text-caption text-text-muted">
              That is all six steps and add-ons. Remove one before adding another.
            </Text>
          )}
        </Section>

        {/* 6. Add-ons */}
        <Section
          title="ADD-ONS"
          hint="Priced extras a client can add. Rush, grommets, lamination."
        >
          {addOns(merged).map((group) => (
            <SpecGroupEditor
              key={group.id}
              group={group}
              step={null}
              busy={busy}
              onSetRequired={() => undefined}
              onAddOption={(label, minor, multiplier) =>
                run(async () =>
                  addOption(group, {
                    label,
                    priceModifierMinor: minor,
                    priceMultiplierBps: multiplier,
                  }),
                )
              }
              onRemoveOption={(optionId) => {
                void run(async () => removeOption(group, optionId));
              }}
              onRemoveGroup={() => {
                void run(async () => removeGroup(listing, group));
              }}
            />
          ))}
          {merged.groups.length < LISTING_CAPS.specGroups ? (
            <AddGroupButton
              kind="addon"
              busy={busy}
              onAdd={(input) =>
                run(async () =>
                  addGroup(listing, {
                    name: input.name,
                    kind: "addon",
                    required: false,
                    firstOption: input.firstOption,
                  }),
                )
              }
            />
          ) : null}
        </Section>

        {/* 7. Before they order */}
        <Section
          title="BEFORE THEY ORDER"
          hint="What a client should do before sending work. Numbered — they read it in order."
        >
          {!prepStepsOpen ? (
            <View className="gg-panel gap-2">
              <Text className="text-body text-text-secondary">{PREP_STEPS_NOT_OPEN_YET}</Text>
              <SecondaryButton label="Check again" onPress={() => void reload()} />
            </View>
          ) : (
            <>
              {prepSteps.map((step, index) => (
                <PrepStepRow
                  key={step.id}
                  step={step}
                  position={index + 1}
                  busy={busy}
                  onRemove={() => {
                    void run(async () => removePrepStep(listing, step.id));
                  }}
                  onMoveUp={
                    index === 0
                      ? undefined
                      : () => {
                          void run(
                            async () => reorderPrepSteps(listing, swap(prepSteps, index, index - 1)),
                            PREP_STEPS_NOT_OPEN_YET,
                          );
                        }
                  }
                  onMoveDown={
                    index === prepSteps.length - 1
                      ? undefined
                      : () => {
                          void run(
                            async () => reorderPrepSteps(listing, swap(prepSteps, index, index + 1)),
                            PREP_STEPS_NOT_OPEN_YET,
                          );
                        }
                  }
                />
              ))}
              {prepSteps.length === 0 ? (
                <Text className="text-body text-text-secondary">
                  Nothing yet. On specialised work this is where a job is won or lost — flatten
                  the art, outline the fonts, export the 3MF at the right scale.
                </Text>
              ) : null}
              {prepSteps.length < LISTING_CAPS.prepSteps ? (
                <AddPrepStepButton
                  busy={busy}
                  onAdd={(input) =>
                    run(
                      async () => addPrepStep(listing, prepSteps, input),
                      PREP_STEPS_NOT_OPEN_YET,
                    )
                  }
                />
              ) : (
                <Text className="text-caption text-text-muted">
                  That is all eight steps. Remove one before adding another.
                </Text>
              )}
            </>
          )}
        </Section>

        {/* 8. Artwork */}
        <Section
          title="ARTWORK YOU ACCEPT"
          hint="What a client may send you for this listing."
        >
          <SegmentedControl
            options={[
              { value: "inherit", label: "Same as your category" },
              { value: "override", label: "Just this listing" },
            ]}
            value={working.fileFormatMode}
            onChange={(value) => setDraft({ ...working, fileFormatMode: value })}
            accessibilityLabel="Which artwork this listing accepts"
          />
          {working.fileFormatMode === "override" ? (
            <View className="gap-5">
              <View className="gap-2">
                <Text className="text-caption text-text-muted">Files they upload</Text>
                <ChipMultiSelect
                  options={uploadedFileOptions(formats, working.formatCodes).map((format) => ({
                    value: format.code,
                    label: format.name,
                  }))}
                  selected={working.formatCodes}
                  onToggle={(code) => setDraft({ ...working, formatCodes: toggle(working.formatCodes, code) })}
                  accessibilityLabel="Files this listing accepts"
                  trailing={
                    <FormatPlusField
                      formats={formats}
                      selected={working.formatCodes}
                      onSelect={(code) =>
                        setDraft({
                          ...working,
                          formatCodes: working.formatCodes.includes(code)
                            ? working.formatCodes
                            : [...working.formatCodes, code],
                        })
                      }
                      disabled={busy}
                    />
                  }
                />
              </View>
              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <LinkGlyph />
                  <Text className="text-caption text-text-muted">Links you accept</Text>
                </View>
                <ChipMultiSelect
                  options={linkFileOptions(formats).map((format) => ({
                    value: format.code,
                    label: format.name,
                    accessibilityLabel: linkFormatInvitation(format.code, formats),
                  }))}
                  selected={working.formatCodes}
                  onToggle={(code) => setDraft({ ...working, formatCodes: toggle(working.formatCodes, code) })}
                  accessibilityLabel="Links this listing accepts"
                />
                <Text className="text-caption text-text-muted">
                  Tick Canva and a client can paste a Canva link on this listing instead of
                  exporting a file.
                </Text>
              </View>
            </View>
          ) : (
            <Text className="text-caption text-text-muted">
              {context.inheritedFormatCodes.length
                ? context.inheritedFormatCodes.map((code) => fileFormatName(code, formats)).join(", ")
                : "Your category has no artwork set yet. Choose it here, or set it once in Services you offer."}
            </Text>
          )}
        </Section>

        {/* 9. On the board */}
        <Section title="ON THE BOARD">
          <Text className="text-body text-text-secondary">
            {merged.onTheBoard
              ? approved
                ? "Clients can see this listing now."
                : "It is up. Clients see it as soon as Operations approves your shop."
              : "Hidden. Only your shop can see it."}
          </Text>
          {blockers.length ? (
            <View className="gg-panel gap-2">
              <Text className="text-body font-medium text-text-primary">
                {blockers.length === 1
                  ? "One thing left before it can go up"
                  : `${blockers.length} things left before it can go up`}
              </Text>
              {blockers.map((blocker) => (
                <Text key={blocker} className="text-body text-text-secondary">
                  {blocker}
                </Text>
              ))}
            </View>
          ) : null}
          {extras.length ? (
            <View className="gg-panel gap-2">
              <Text className="text-body font-medium text-text-primary">
                Worth filling in
              </Text>
              {extras.map((line) => (
                <Text key={line} className="text-body text-text-secondary">
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
          <DestinationRow
            title="See what clients see"
            detail="Your listing the way it reads on a client's phone"
            onPress={() =>
              void persistThen(() =>
                router.push({ pathname: "/shop/[id]/preview", params: { id } }),
              )
            }
          />
        </Section>

        {notice ? (
          <View className="gg-panel mt-6">
            <Text className="text-body text-text-secondary">{notice}</Text>
          </View>
        ) : null}

        {actionError ? (
          <View className="mt-6">
            <ErrorNotice message={actionError} />
          </View>
        ) : null}

        <View className="mt-10">
          <DangerButton label="Remove this listing" disabled={busy} onPress={() => void remove()} />
        </View>
      </FormScrollView>

      {/*
        The foot stays put because the two things a shop does here — keep
        working, or put it up — must be reachable from any section without
        scrolling to the end of a long form. The inset is the platform's
        keep-out zone and the padding is breathing room, so they stack.
      */}
      <View
        className="gg-page border-t border-outline bg-surface pt-3"
        style={{ paddingBottom: insets.bottom + spacing.md }}
      >
        {merged.onTheBoard ? (
          <View className="gap-3">
            <PrimaryButton
              label={busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
              disabled={busy || !dirty}
              onPress={() => void persist()}
            />
            <SecondaryButton
              label="Take it off the board"
              disabled={busy}
              onPress={() => void takeOff()}
            />
          </View>
        ) : (
          <View className="gap-3">
            <PrimaryButton
              label={busy ? "Saving…" : "Put on the board"}
              disabled={busy || blockers.length > 0}
              onPress={() => void persist(true)}
            />
            {blockers.length ? (
              <Text className="text-caption text-text-muted">{blockers[0]}</Text>
            ) : null}
            <SecondaryButton
              label={busy ? "Saving…" : dirty ? "Save draft" : "Draft saved"}
              disabled={busy || !dirty}
              onPress={() => void persist()}
            />
          </View>
        )}
      </View>

      <BusyOverlay visible={busy} label="Saving your listing…" />
    </View>
  );
}

export { sameDraft } from "@/lib/listingDraft";

function LinkGlyph() {
  const colors = useThemeColors();
  return <Link2 size={13} color={colors.textMuted} strokeWidth={2} />;
}

function toggle(codes: string[], code: string): string[] {
  return codes.includes(code) ? codes.filter((entry) => entry !== code) : [...codes, code];
}

/** Two entries traded, leaving the array they came from alone. */
function swap<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

