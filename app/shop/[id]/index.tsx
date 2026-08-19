import { ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BusyOverlay } from "@/components/BusyOverlay";
import { DangerButton } from "@/components/DangerButton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SamplePhoto } from "@/components/SamplePhoto";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { AddGroupButton, SpecGroupEditor } from "@/components/SpecGroupEditor";
import { StatusChip } from "@/components/StatusChip";
import { ChipMultiSelect } from "@/components/ChipMultiSelect";
import { MoneyField } from "@/components/controls/MoneyField";
import { NoteField } from "@/components/controls/NoteField";
import { OptionList } from "@/components/controls/OptionList";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { Stepper } from "@/components/controls/Stepper";
import { TextField } from "@/components/controls/TextField";
import { fileFormatName, PUBLISHED_FILE_FORMATS } from "@/data/fileFormats";
import { spacing } from "@/constants/theme";
import {
  addOns,
  boardBlockers,
  boardContextFor,
  boardStanding,
  LISTING_CAPS,
  priceLine,
  readyInLine,
  specs,
  subcategoryName,
  type Listing,
} from "@/lib/listings";
import {
  addGroup,
  addOption,
  BOARD_NOT_OPEN_YET,
  removeGroup,
  removeListing,
  removeOption,
  renameGroup,
  saveListing,
  setFileFormats,
} from "@/lib/listingsApi";
import { parseMoney } from "@/lib/money";
import { resolveCategoryCode } from "@/lib/taxonomy";
import { useListing } from "@/hooks/useBoard";
import { useThemeColors } from "@/hooks/useTheme";
import { askConfirm } from "@/store/sheets";
import { isMatchable, useSession } from "@/store/session";

/**
 * One listing, in sections.
 *
 * Everything a shop changes about a listing is on this screen rather than
 * behind a twelve-step wizard: a price change is one tap in, not a flow. Only
 * the samples and the client's-eye view get their own screens, because one is a
 * camera roll and the other is a different point of view.
 *
 * Two kinds of change live here and the copy says which is which. The words,
 * the price and the times are held until the foot is pressed, so a half-typed
 * name is never saved. Steps, add-ons and their options are their own records
 * on GRIDGO and save as they are added — pretending otherwise would mean
 * holding a pile of unsent rows and losing them to a back gesture.
 */
export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const approved = isMatchable(useSession((s) => s.user));
  const { listing, catalog, services, loading, notOpenYet, error, reload } = useListing(id);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (listing) setDraft(draftFrom(listing));
  }, [listing]);

  const merged = useMemo(
    () => (listing && draft ? applyDraft(listing, draft) : listing),
    [listing, draft],
  );
  const context = useMemo(
    () => (merged ? boardContextFor(merged, services) : null),
    [merged, services],
  );
  const blockers = merged && context ? boardBlockers(merged, context) : [];
  const standing = merged && context ? boardStanding(merged, context, approved) : null;

  /** Every write goes through here, so one failure sentence has one home. */
  const run = useCallback(
    async (work: () => Promise<{ status: string; message?: string }>) => {
      setBusy(true);
      setActionError(null);
      const result = await work();
      if (result.status === "ok") {
        await reload();
        setBusy(false);
        return true;
      }
      setActionError(
        result.status === "not_open_yet" ? BOARD_NOT_OPEN_YET : (result.message ?? ""),
      );
      setBusy(false);
      return false;
    },
    [reload],
  );

  async function persist(onTheBoard?: boolean): Promise<boolean> {
    if (!listing || !draft) return false;
    const money = parseMoney(draft.price);
    if (!money.ok) {
      setActionError(money.error);
      return false;
    }

    const saved = await run(async () =>
      saveListing(listing, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        basePriceMinor: money.minor ?? 0,
        pricingUnit: draft.pricingUnit,
        packageQty: draft.pricingUnit === "per_package" ? draft.packageQty : null,
        turnaroundMode: draft.turnaroundMode,
        turnaroundHours: draft.turnaroundMode === "override" ? draft.turnaroundHours : null,
        subcategoryCode: draft.subcategoryCode,
        ...(onTheBoard == null ? {} : { active: onTheBoard }),
      }),
    );
    if (!saved) return false;

    // The formats are their own route, so they are only sent when they moved.
    const formatsMoved =
      draft.fileFormatMode !== listing.fileFormatMode ||
      draft.formatCodes.join(",") !== listing.formatCodes.join(",");
    if (formatsMoved) {
      return run(async () =>
        setFileFormats(
          listing.id,
          draft.fileFormatMode === "override" ? draft.formatCodes : [],
        ),
      );
    }
    return true;
  }

  async function takeOff() {
    if (!listing) return;
    const confirmed = await askConfirm({
      question: `Take “${listing.name}” off the board?`,
      consequence:
        "Clients stop seeing it straight away. Nothing you have written is lost, and you can put it back up any time.",
      confirmLabel: "Take it off",
      cancelLabel: "Leave it up",
      destructive: true,
    });
    if (confirmed) await persist(false);
  }

  async function remove() {
    if (!listing) return;
    const confirmed = await askConfirm({
      question: `Remove “${listing.name}” from your shop?`,
      consequence:
        "It comes off your board and its samples, steps and prices go with it. A listing a client has already ordered from is kept for that job's history instead.",
      confirmLabel: "Remove it",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!confirmed) return;
    if (await run(async () => removeListing(listing.id))) router.back();
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

  if (!listing || !draft || !merged || !context || !standing) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="This listing is not reachable"
          body={error ?? "GRIDGO did not return this listing. Pull back and open it again."}
          actionLabel="Try again"
          onAction={() => void reload()}
        />
      </View>
    );
  }

  const category = catalog
    ? catalog.categories.find((entry) =>
        entry.covers.some((cover) => cover.code === listing.subcategoryCode),
      ) ??
      catalog.categories.find(
        (entry) =>
          entry.code ===
          resolveCategoryCode(catalog, services.find((s) => s.id === listing.serviceLineId)?.categoryCode ?? ""),
      ) ??
      null
    : null;

  return (
    <View className="gg-screen">
      <FormScrollView contentClassName="gg-page pb-10 pt-4" bottomOffset={spacing.xxl}>
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">{merged.name || "Untitled listing"}</Text>
          <Text className="text-body-lg font-medium text-text-primary">{priceLine(merged)}</Text>
          <View className="flex-row">
            <StatusChip tone={standing.tone} icon={standing.icon} label={standing.label} />
          </View>
          {standing.note ? (
            <Text className="text-body text-text-secondary">{standing.note}</Text>
          ) : null}
        </View>

        {/* 1. Samples */}
        <Section title="SAMPLE PHOTOS" hint="The first one is what clients see on your board.">
          <View className="flex-row flex-wrap">
            {listing.photos.slice(0, 4).map((photo) => (
              <View key={photo.fileId} className="w-1/4">
                <SamplePhoto
                  fileId={photo.fileId}
                  altText={photo.altText ?? merged.name}
                  gutter="tight"
                />
              </View>
            ))}
            {listing.photos.length === 0 ? (
              <View className="w-1/2">
                <SamplePhoto gutter="tight" emptyLabel="No samples yet" />
              </View>
            ) : null}
          </View>
          <DestinationRow
            title={listing.photos.length ? "Change your samples" : "Add a sample photo"}
            detail={
              listing.photos.length
                ? `${listing.photos.length} of ${LISTING_CAPS.photos} used. Reorder or remove them.`
                : "A listing cannot go on the board without one."
            }
            onPress={() => router.push({ pathname: "/shop/[id]/photos", params: { id } })}
          />
        </Section>

        {/* 2. What it is */}
        <Section title="WHAT IT IS">
          <TextField
            value={draft.name}
            onChange={(value) =>
              setDraft({ ...draft, name: value.slice(0, LISTING_CAPS.nameChars) })
            }
            placeholder="Tarpaulin, 13oz"
            accessibilityLabel="Listing name"
            kind="text"
          />
          <NoteField
            value={draft.description}
            onChange={(value) => setDraft({ ...draft, description: value })}
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
                value={draft.subcategoryCode}
                onChange={(value) => setDraft({ ...draft, subcategoryCode: value })}
                accessibilityLabel="What kind of work this listing is"
              />
            </View>
          ) : (
            <Text className="text-caption text-text-muted">
              {subcategoryName(catalog, merged.subcategoryCode)}
            </Text>
          )}
        </Section>

        {/* 3. Price */}
        <Section
          title="PRICE"
          hint="Your own asking price. What GRIDGO charges the client on top is not yours to set."
        >
          <SegmentedControl
            options={[
              { value: "per_unit", label: "Per piece" },
              { value: "per_package", label: "Per pack" },
            ]}
            value={draft.pricingUnit}
            onChange={(value) => setDraft({ ...draft, pricingUnit: value })}
            accessibilityLabel="How this listing is priced"
          />
          <MoneyField
            value={draft.price}
            onChange={(value) => setDraft({ ...draft, price: value })}
            accessibilityLabel="Your price"
          />
          {draft.pricingUnit === "per_package" ? (
            <View className="gap-2">
              <Text className="text-caption text-text-muted">How many pieces in a pack</Text>
              <Stepper
                value={draft.packageQty ?? 100}
                onChange={(value) => setDraft({ ...draft, packageQty: value })}
                min={2}
                max={5000}
                step={PACK_STEP}
                unit="pieces"
                accessibilityLabel="Pieces in a pack"
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
            value={draft.turnaroundMode}
            onChange={(value) => setDraft({ ...draft, turnaroundMode: value })}
            accessibilityLabel="How long this listing takes"
          />
          {draft.turnaroundMode === "override" ? (
            <Stepper
              value={draft.turnaroundHours ?? 24}
              onChange={(value) => setDraft({ ...draft, turnaroundHours: value })}
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

        {/* 5. Specs */}
        <Section
          title="STEPS A CLIENT WALKS"
          hint="In this order. Each one saves as you add it."
        >
          {specs(merged).map((group, index) => (
            <SpecGroupEditor
              key={group.id}
              group={group}
              step={index + 1}
              busy={busy}
              onSetRequired={(required) => {
                void run(async () => renameGroup(listing.id, group.id, { required }));
              }}
              onAddOption={(label, minor) =>
                run(async () => addOption(group.id, { label, priceModifierMinor: minor }))
              }
              onRemoveOption={(optionId) => {
                void run(async () => removeOption(group.id, optionId));
              }}
              onRemoveGroup={() => {
                void run(async () => removeGroup(listing.id, group.id));
              }}
            />
          ))}
          {specs(merged).length < LISTING_CAPS.specGroups ? (
            <AddGroupButton
              kind="spec"
              busy={busy}
              onAdd={(name) =>
                run(async () => addGroup(listing.id, { name, kind: "spec", required: true }))
              }
            />
          ) : (
            <Text className="text-caption text-text-muted">
              That is all six steps. Remove one before adding another.
            </Text>
          )}
        </Section>

        {/* 6. Add-ons */}
        <Section title="ADD-ONS" hint="Extras a client can tick. Never required.">
          {addOns(merged).map((group) => (
            <SpecGroupEditor
              key={group.id}
              group={group}
              step={null}
              busy={busy}
              onSetRequired={() => undefined}
              onAddOption={(label, minor) =>
                run(async () => addOption(group.id, { label, priceModifierMinor: minor }))
              }
              onRemoveOption={(optionId) => {
                void run(async () => removeOption(group.id, optionId));
              }}
              onRemoveGroup={() => {
                void run(async () => removeGroup(listing.id, group.id));
              }}
            />
          ))}
          {merged.groups.length < LISTING_CAPS.specGroups ? (
            <AddGroupButton
              kind="addon"
              busy={busy}
              onAdd={(name) =>
                run(async () => addGroup(listing.id, { name, kind: "addon", required: false }))
              }
            />
          ) : null}
        </Section>

        {/* 7. Files you accept */}
        <Section
          title="FILES YOU ACCEPT"
          hint="What a client may send as artwork for this listing."
        >
          <SegmentedControl
            options={[
              { value: "inherit", label: "Same as your category" },
              { value: "override", label: "Just this listing" },
            ]}
            value={draft.fileFormatMode}
            onChange={(value) => setDraft({ ...draft, fileFormatMode: value })}
            accessibilityLabel="Which files this listing accepts"
          />
          {draft.fileFormatMode === "override" ? (
            <ChipMultiSelect
              options={PUBLISHED_FILE_FORMATS.map((format) => ({
                value: format.code,
                label: format.name,
              }))}
              selected={draft.formatCodes}
              onToggle={(code) =>
                setDraft({
                  ...draft,
                  formatCodes: draft.formatCodes.includes(code)
                    ? draft.formatCodes.filter((entry) => entry !== code)
                    : [...draft.formatCodes, code],
                })
              }
              accessibilityLabel="Files this listing accepts"
            />
          ) : (
            <Text className="text-caption text-text-muted">
              {context.inheritedFormatCodes.length
                ? context.inheritedFormatCodes.map(fileFormatName).join(", ")
                : "Your category has no file types set yet. Choose them here, or set them once in Services you offer."}
            </Text>
          )}
        </Section>

        {/* 8. On the board */}
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
          <DestinationRow
            title="See what clients see"
            detail="Your listing the way it reads on a client's phone"
            onPress={() => router.push({ pathname: "/shop/[id]/preview", params: { id } })}
          />
        </Section>

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
              label={busy ? "Saving…" : "Save changes"}
              disabled={busy}
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
              label={busy ? "Saving…" : "Save draft"}
              disabled={busy}
              onPress={() => void persist()}
            />
          </View>
        )}
      </View>

      <BusyOverlay visible={busy} label="Saving your listing…" />
    </View>
  );
}

/** A pack is usually round: 100, 500, 1000. Stepping by one would be cruel. */
const PACK_STEP = 25;

type Draft = {
  name: string;
  description: string;
  /** Pesos as typed, so a half-typed "12." is not mangled. */
  price: string;
  pricingUnit: Listing["pricingUnit"];
  packageQty: number | null;
  turnaroundMode: Listing["turnaroundMode"];
  turnaroundHours: number | null;
  subcategoryCode: string;
  fileFormatMode: Listing["fileFormatMode"];
  formatCodes: string[];
};

function draftFrom(listing: Listing): Draft {
  return {
    name: listing.name,
    description: listing.description,
    price: listing.basePriceMinor ? (listing.basePriceMinor / 100).toFixed(2) : "",
    pricingUnit: listing.pricingUnit,
    packageQty: listing.packageQty,
    turnaroundMode: listing.turnaroundMode,
    turnaroundHours: listing.turnaroundHours,
    subcategoryCode: listing.subcategoryCode,
    fileFormatMode: listing.fileFormatMode,
    formatCodes: listing.formatCodes,
  };
}

/**
 * The listing as it would be if the shop pressed save now.
 *
 * Completeness is read off this rather than off what GRIDGO holds, so the
 * reason under a disabled action matches what is on screen — a shop that has
 * just typed a name should not be told it needs one.
 */
function applyDraft(listing: Listing, draft: Draft): Listing {
  const money = parseMoney(draft.price);
  return {
    ...listing,
    name: draft.name.trim(),
    description: draft.description.trim(),
    basePriceMinor: money.ok ? (money.minor ?? 0) : listing.basePriceMinor,
    pricingUnit: draft.pricingUnit,
    packageQty: draft.pricingUnit === "per_package" ? draft.packageQty : null,
    turnaroundMode: draft.turnaroundMode,
    turnaroundHours: draft.turnaroundMode === "override" ? draft.turnaroundHours : null,
    subcategoryCode: draft.subcategoryCode,
    fileFormatMode: draft.fileFormatMode,
    formatCodes: draft.formatCodes,
  };
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-8 gap-3">
      <View className="gap-1">
        <Text className="text-overline text-text-muted">{title}</Text>
        {hint ? <Text className="text-caption text-text-muted">{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function DestinationRow({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">{title}</Text>
        <Text className="text-caption text-text-muted" numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
    </Pressable>
  );
}
