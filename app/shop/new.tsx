import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { SkeletonBlock } from "@/components/Skeleton";
import { ClientPreviewCard } from "@/components/listing/ClientPreviewCard";
import { ListingWizardShell } from "@/components/listing/ListingWizardShell";
import { AboutStep } from "@/components/listing/wizard/AboutStep";
import { ArtworkStep } from "@/components/listing/wizard/ArtworkStep";
import { PickStep, BLANK_STARTER } from "@/components/listing/wizard/PickStep";
import { PriceStep } from "@/components/listing/wizard/PriceStep";
import { ReviewStep } from "@/components/listing/wizard/ReviewStep";
import { SpeedStep } from "@/components/listing/wizard/SpeedStep";
import { StepsStep } from "@/components/listing/wizard/StepsStep";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import {
  applyDraft,
  draftFrom,
  formatsMoved,
  listingSavePatch,
  sameDraft,
  type ListingDraft,
} from "@/lib/listingDraft";
import {
  aboutBlocker,
  artworkBlocker,
  createListingName,
  pickReady,
  priceReady,
  productionHours,
  speedReady,
  wizardStepIndex,
  type WizardStepId,
} from "@/lib/listingWizard";
import {
  boardContextFor,
  boardTargets,
  gridgoNeeds,
  hasRequiredSpec,
  needsPrinterCap,
  reviewNeeds,
  reviewsListings,
  SPECS_NEEDED,
  subcategoryName,
  type Listing,
  type ListingStarter,
} from "@/lib/listings";
import {
  productTypeChoices,
  type ProductType,
  type ProductTypeChoice,
} from "@/lib/productTypes";
import {
  addGroup,
  addOption,
  addPrepStep,
  BOARD_NOT_OPEN_YET,
  PREP_STEPS_NOT_OPEN_YET,
  createListing,
  loadProductTypes,
  loadStarters,
  removeGroup,
  removeOption,
  removePhoto,
  removePrepStep,
  reorderPrepSteps,
  saveGroup,
  saveListing,
  setFileFormats,
  submitForReview,
  type BoardOutcome,
} from "@/lib/listingsApi";
import { parseMoney } from "@/lib/money";
import { seedStarterSample } from "@/lib/starterSample";
import { useAcceptedFileFormats } from "@/hooks/useAcceptedFileFormats";
import { useBoard, useListing } from "@/hooks/useBoard";
import { isMatchable, useSession } from "@/store/session";
import { endPhotoPolicySubmission, ensurePhotoPolicy } from "@/store/photoPolicy";
import { askConfirm } from "@/store/sheets";
import { useListingWizard } from "@/store/listingWizard";

/**
 * Putting something new on the board — Pick through Review.
 *
 * A new listing is always created hidden. Nothing goes up until Review →
 * Submit for review, and then only once Operations approves it (a GRIDGO
 * without listing review keeps the older Place on Board). The live editor
 * stays one screen; this wizard is only for a listing that has not been
 * pinned yet.
 */
export default function NewListingScreen() {
  const { catalog, services, loading, notOpenYet, error, reload: reloadBoard } = useBoard();
  const approved = isMatchable(useSession((s) => s.user));
  const formats = useAcceptedFileFormats();
  const session = useListingWizard();

  const targets = useMemo(() => boardTargets(catalog, services), [catalog, services]);
  const [chosenCategoryCode, setCategoryCode] = useState<string | null>(null);
  const [subcategoryCode, setSubcategoryCode] = useState<string | null>(null);
  const [starterId, setStarterId] = useState<string>(BLANK_STARTER);
  const [starters, setStarters] = useState<ListingStarter[]>([]);
  const [startersLoading, setStartersLoading] = useState(false);
  const [starterError, setStarterError] = useState<string | null>(null);
  const [startersFor, setStartersFor] = useState<string | null>(null);
  const [printerMaxWidthFeet, setPrinterMaxWidthFeet] = useState<number | null>(null);
  const [productTypes, setProductTypes] = useState<ProductType[] | null>(null);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typesError, setTypesError] = useState<string | null>(null);
  const [typeQuery, setTypeQuery] = useState("");

  const [listingId, setListingId] = useState<string | null>(session.listingId);
  const [step, setStep] = useState<WizardStepId>(session.listingId ? session.step : "pick");
  const [created, setCreated] = useState<Listing | null>(null);
  const [draft, storeDraft] = useState<ListingDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notOpenOnSave, setNotOpenOnSave] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const placingRef = useRef(false);

  const {
    listing: loaded,
    catalog: listingCatalog,
    services: listingServices,
    prepSteps,
    prepStepsOpen,
    loading: listingLoading,
    notOpenYet: listingNotOpen,
    error: listingError,
    reload,
  } = useListing(listingId, useCallback(() => dirtyRef.current, []));

  const listing = loaded ?? created;
  const boardCatalog = listingCatalog ?? catalog;
  const boardServices = listingServices.length ? listingServices : services;

  const categoryCode =
    chosenCategoryCode ?? (targets.length === 1 ? targets[0].category.code : null);
  const target = targets.find((entry) => entry.category.code === categoryCode) ?? null;

  const baseline = listing;
  const working = draft ?? (listing ? draftFrom(listing) : null);
  const dirty = Boolean(baseline && working && !sameDraft(working, draftFrom(baseline)));
  useLayoutEffect(() => {
    dirtyRef.current = dirty;
  });

  function setDraft(value: ListingDraft | null) {
    const changed = Boolean(value && baseline && !sameDraft(value, draftFrom(baseline)));
    dirtyRef.current = changed;
    storeDraft(changed ? value : null);
  }

  const merged = useMemo(
    () => (listing && working ? applyDraft(listing, working) : listing),
    [listing, working],
  );
  const context = useMemo(
    () => (merged ? boardContextFor(merged, boardServices) : null),
    [merged, boardServices],
  );
  const reviewed = Boolean(merged && reviewsListings(merged));
  // Operations reviews every new listing, and review also asks for a required spec.
  const blockers =
    merged && context ? (reviewed ? reviewNeeds(merged, context) : gridgoNeeds(merged, context)) : [];

  const takeTypes = useCallback((result: BoardOutcome<ProductType[]>) => {
    setTypesLoading(false);
    if (result.status === "ok") {
      setProductTypes(result.value);
      setTypesError(null);
      return;
    }
    // No picker on this GRIDGO yet: the chart's own coverage stands in.
    setProductTypes(null);
    setTypesError(result.status === "failed" ? result.message : null);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void loadProductTypes().then((result) => {
      if (!cancelled) takeTypes(result);
    });
    return () => {
      cancelled = true;
    };
  }, [takeTypes]);
  function loadTypes() {
    setTypesLoading(true);
    void loadProductTypes().then(takeTypes);
  }

  const choices = useMemo(() => {
    const all = productTypeChoices(productTypes, targets, catalog);
    // Once the listing exists its category line is fixed; only its type may change.
    return listingId && categoryCode
      ? all.filter((choice) => choice.targetCategoryCode === categoryCode)
      : all;
  }, [catalog, categoryCode, listingId, productTypes, targets]);
  const categoryNames = useMemo(
    () => Object.fromEntries(targets.map((entry) => [entry.category.code, entry.category.name])),
    [targets],
  );

  useEffect(() => {
    if (!session.listingId || listingId) return;
    setListingId(session.listingId);
    setStep(session.step);
  }, [listingId, session.listingId, session.step]);

  useEffect(() => {
    // A listing we just pinned is still this wizard until replace. One that
    // was already on the board belongs in the one-screen editor, not here.
    if (!loaded?.onTheBoard || placingRef.current) return;
    useListingWizard.getState().clear();
    setListingId(null);
    setCreated(null);
    setStep("pick");
  }, [loaded]);

  useLayoutEffect(() => {
    // A 404 on the draft is "this listing is gone", not "the board is closed".
    // loadListing maps that 404 to not_open_yet. If the board itself loaded,
    // start Pick again — Check again on the closed-board screen would refetch
    // the same missing id forever.
    if (!listingId || listing || listingLoading || notOpenYet) return;
    if (!listingNotOpen && !listingError) return;
    useListingWizard.getState().forget(listingId);
    setListingId(null);
    setCreated(null);
    storeDraft(null);
    setStep("pick");
  }, [listing, listingError, listingId, listingLoading, listingNotOpen, notOpenYet]);

  useEffect(() => {
    if (!listing) return;
    setSubcategoryCode(listing.subcategoryCode);
    setPrinterMaxWidthFeet(listing.printerMaxWidthFeet);
    const line = boardServices.find((service) => service.id === listing.serviceLineId);
    if (line) setCategoryCode(line.categoryCode);
  }, [boardServices, listing]);

  if (startersFor !== subcategoryCode) {
    setStartersFor(subcategoryCode);
    setStarters([]);
    setStarterId(BLANK_STARTER);
    setStarterError(null);
    setStartersLoading(Boolean(subcategoryCode) && !listingId);
  }

  useEffect(() => {
    if (!subcategoryCode || listingId) return;
    let cancelled = false;
    void (async () => {
      const result = await loadStarters(subcategoryCode);
      if (cancelled) return;
      setStartersLoading(false);
      if (result.status === "ok") {
        setStarters(result.value);
        setStarterId(result.value[0]?.id ?? BLANK_STARTER);
        setStarterError(null);
        return;
      }
      setStarters([]);
      setStarterId(BLANK_STARTER);
      setStarterError(result.status === "failed" ? result.message : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId, subcategoryCode]);

  function retryStarters() {
    if (!subcategoryCode) return;
    setStarterError(null);
    setStartersLoading(true);
    void (async () => {
      const result = await loadStarters(subcategoryCode);
      setStartersLoading(false);
      if (result.status === "ok") {
        setStarters(result.value);
        setStarterId(result.value[0]?.id ?? BLANK_STARTER);
        setStarterError(null);
        return;
      }
      setStarters([]);
      setStarterId(BLANK_STARTER);
      setStarterError(result.status === "failed" ? result.message : null);
    })();
  }

  const run = useCallback(
    async <T,>(work: () => Promise<BoardOutcome<T>>, absent = BOARD_NOT_OPEN_YET) => {
      setBusy(true);
      setActionError(null);
      setNotOpenOnSave(null);
      const result = await work();
      if (result.status === "ok") {
        await reload();
        setBusy(false);
        return true;
      }
      if (result.status === "not_open_yet") setNotOpenOnSave(absent);
      else setActionError(result.message);
      setBusy(false);
      return false;
    },
    [reload],
  );

  const persist = useCallback(
    async (onTheBoard?: boolean): Promise<boolean> => {
      if (!baseline || !working) return false;
      const money = parseMoney(working.price);
      if (!money.ok) {
        setActionError(money.error);
        return false;
      }
      const window = productionHours(working, context?.inheritedTurnaroundHours ?? null);
      const toSave =
        step === "speed"
          ? {
              ...working,
              turnaroundMode: "override" as const,
              minimumTurnaroundHours: window.min,
              turnaroundHours: window.max,
              speedTiers: [],
            }
          : working;
      if (toSave !== working) setDraft(toSave);

      savingRef.current = true;
      setBusy(true);
      setActionError(null);
      setNotOpenOnSave(null);
      try {
        const saved = await saveListing(
          baseline,
          listingSavePatch(toSave, money.minor ?? 0, onTheBoard),
        );
        if (saved.status !== "ok") {
          if (saved.status === "not_open_yet") setNotOpenOnSave(BOARD_NOT_OPEN_YET);
          else setActionError(saved.message);
          return false;
        }
        dirtyRef.current = false;
        storeDraft(null);
        setCreated(saved.value);

        if (formatsMoved(toSave, baseline)) {
          const formatsSaved = await setFileFormats(
            saved.value,
            toSave.fileFormatMode,
            toSave.formatCodes,
          );
          if (formatsSaved.status !== "ok") {
            await reload();
            if (formatsSaved.status === "not_open_yet") setNotOpenOnSave(BOARD_NOT_OPEN_YET);
            else setActionError(formatsSaved.message);
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
    [baseline, context?.inheritedTurnaroundHours, reload, step, working],
  );

  const persistThen = useCallback(
    async (go: () => void) => {
      if (dirtyRef.current && !savingRef.current) {
        if (!(await persist())) return;
      }
      go();
    },
    [persist],
  );

  function goTo(next: WizardStepId) {
    setStep(next);
    setActionError(null);
    if (listingId) useListingWizard.getState().remember(listingId, next);
    else useListingWizard.getState().setStep(next);
  }

  const pickIsReady = pickReady({
    categoryCode,
    subcategoryCode,
    printerMaxWidthFeet,
  });

  async function persistPick(): Promise<Listing | null> {
    if (!target || !subcategoryCode) return null;
    if (listing && working) {
      const next = {
        ...working,
        subcategoryCode,
        printerMaxWidthFeet: needsPrinterCap(subcategoryCode) ? printerMaxWidthFeet : null,
      };
      setDraft(next);
      const money = parseMoney(next.price);
      if (!money.ok) {
        setActionError(money.error);
        return null;
      }
      setBusy(true);
      setActionError(null);
      setNotOpenOnSave(null);
      try {
        const saved = await saveListing(listing, listingSavePatch(next, money.minor ?? 0));
        if (saved.status !== "ok") {
          if (saved.status === "not_open_yet") setNotOpenOnSave(BOARD_NOT_OPEN_YET);
          else setActionError(saved.message);
          return null;
        }
        dirtyRef.current = false;
        storeDraft(null);
        setCreated(saved.value);
        await reload();
        return saved.value;
      } finally {
        setBusy(false);
      }
    }

    setCreating(true);
    setActionError(null);
    setNotOpenOnSave(null);
    const chosenStarter = starterId === BLANK_STARTER ? null : starterId;
    const coverName = subcategoryName(boardCatalog, subcategoryCode);
    try {
      const result = await createListing({
        serviceLineId: target.service.id,
        subcategoryCode,
        name: createListingName({ typedName: "", subcategoryName: coverName }),
        starterId: chosenStarter,
        printerMaxWidthFeet: needsPrinterCap(subcategoryCode) ? printerMaxWidthFeet : null,
      });

      if (result.status !== "ok") {
        if (result.status === "not_open_yet") setNotOpenOnSave(BOARD_NOT_OPEN_YET);
        else setActionError(result.message);
        return null;
      }

      if (chosenStarter) {
        try {
          await seedStarterSample(chosenStarter, result.value.id);
        } catch {
          // The listing exists. Continuing is more useful than a stuck overlay.
        }
      }

      setCreated(result.value);
      setListingId(result.value.id);
      useListingWizard.getState().remember(result.value.id, "about");
      return result.value;
    } catch (caught) {
      setActionError(humanizeApiError(caught, offlineMessage("open this listing")));
      return null;
    } finally {
      setCreating(false);
    }
  }

  async function proceed() {
    if (step === "pick") {
      if (!pickIsReady) return;
      const opened = await persistPick();
      if (!opened) return;
      goTo("about");
      return;
    }
    if (!listing || !working || !merged || !context) return;

    if (step === "about") {
      const blocker = aboutBlocker(listing, working.name);
      if (blocker) {
        setActionError(blocker);
        return;
      }
      if (!(await persist())) return;
      goTo("price");
      return;
    }
    if (step === "price") {
      if (!priceReady(working.price)) {
        const money = parseMoney(working.price);
        setActionError(money.ok ? "Set your price before it can go on the board." : money.error);
        return;
      }
      if (!(await persist())) return;
      goTo("speed");
      return;
    }
    if (step === "speed") {
      if (!speedReady(listing, working, context)) {
        setActionError("Set the soonest and latest this listing takes.");
        return;
      }
      if (!(await persist())) return;
      goTo("steps");
      return;
    }
    if (step === "steps") {
      if (!hasRequiredSpec(merged)) {
        setActionError(SPECS_NEEDED);
        return;
      }
      goTo("artwork");
      return;
    }
    if (step === "artwork") {
      const blocker = artworkBlocker(listing, working, context);
      if (blocker) {
        setActionError(blocker);
        return;
      }
      if (!(await persist())) return;
      goTo("review");
    }
  }

  async function saveDraft() {
    if (step === "pick") {
      if (!pickIsReady) return;
      await persistPick();
      return;
    }
    if (dirty) await persist();
  }

  async function placeOnBoard() {
    if (!merged || !context || blockers.length) return;
    // Photo policies: once per submission, so a shop that confirmed at the
    // photo step goes straight up. "Check my photos" opens them, not a wall.
    const policy = await ensurePhotoPolicy(merged, "submit");
    if (policy === "check_photos") {
      void persistThen(() =>
        router.push({ pathname: "/shop/[id]/photos", params: { id: merged.id } }),
      );
      return;
    }
    if (policy !== "confirmed") return;
    placingRef.current = true;
    if (!(await persist(true))) {
      placingRef.current = false;
      return;
    }
    if (reviewed) {
      setBusy(true);
      const sent = await submitForReview(merged);
      setBusy(false);
      if (sent.status !== "ok") {
        placingRef.current = false;
        await reload();
        if (sent.status === "not_open_yet") setNotOpenOnSave(BOARD_NOT_OPEN_YET);
        else setActionError(sent.message);
        return;
      }
    }
    endPhotoPolicySubmission(merged.id);
    useListingWizard.getState().clear();
    router.replace("/(tabs)/catalogues");
  }

  async function cancel() {
    if (!listingId) {
      useListingWizard.getState().clear();
      router.back();
      return;
    }
    if (dirty) {
      const confirmed = await askConfirm(
        {
          question: `Leave “${working?.name.trim() || "this listing"}” without saving what you typed?`,
          consequence:
            "Nothing you have just typed will be kept. The listing stays hidden on your board.",
          confirmLabel: "Leave",
          cancelLabel: "Keep editing",
        },
        "/shop/confirm",
      );
      if (!confirmed) return;
    }
    useListingWizard.getState().clear();
    router.back();
  }

  function onSelectStep(next: WizardStepId) {
    if (wizardStepIndex(next) < wizardStepIndex(step)) {
      void persistThen(() => goTo(next));
      return;
    }
    void proceed();
  }

  const currentCanProceed = (() => {
    if (step === "pick") return pickIsReady;
    if (!listing || !working || !context) return false;
    if (step === "about") return aboutBlocker(listing, working.name) == null;
    if (step === "price") return priceReady(working.price);
    if (step === "speed") return speedReady(listing, working, context);
    if (step === "steps") return merged ? hasRequiredSpec(merged) : false;
    if (step === "artwork") return artworkBlocker(listing, working, context) == null;
    return blockers.length === 0;
  })();

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
          onAction={() => void reloadBoard()}
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

  if (listingId && listingLoading && !listing) {
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
        </View>
      </View>
    );
  }

  if (listingId && listingNotOpen && !listing) {
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

  if (listingId && !listing) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="This listing did not load"
          body={
            listingError ??
            "GRIDGO did not answer for this listing. Check this phone's connection and try again."
          }
          actionLabel="Try again"
          onAction={() => void reload()}
        />
      </View>
    );
  }

  const committed = Boolean(listingId);
  const leftIsCancel = (step === "pick" && !listingId) || step === "review";
  const leftLabel = leftIsCancel
    ? "Cancel"
    : busy
      ? "Saving…"
      : dirty
        ? "Save draft"
        : "Draft saved";
  const rightLabel =
    step === "review"
      ? reviewed
        ? "Submit for review"
        : "Place on Board"
      : creating
        ? "Opening…"
        : "Proceed";
  const rightDisabled =
    busy ||
    creating ||
    (step === "pick" && !pickIsReady) ||
    (step === "review" && blockers.length > 0);
  const leftDisabled = leftIsCancel ? busy : busy || !dirty;
  const showPreview =
    listing &&
    merged &&
    (step === "price" || step === "speed" || step === "steps" || step === "artwork");

  return (
    <ListingWizardShell
      step={step}
      furthest={session.furthest}
      committed={committed}
      currentCanProceed={currentCanProceed}
      onSelectStep={onSelectStep}
      error={error && step === "pick" ? error : actionError}
      onRetryError={error && step === "pick" ? () => void reloadBoard() : undefined}
      notOpenMessage={notOpenOnSave}
      leftLabel={leftLabel}
      leftDisabled={leftDisabled}
      onLeft={() => void (leftIsCancel ? cancel() : saveDraft())}
      rightLabel={rightLabel}
      rightDisabled={rightDisabled}
      onRight={() => void (step === "review" ? placeOnBoard() : proceed())}
      footNote={step === "review" && blockers.length ? blockers[0] : null}
      busy={busy || creating}
      busyLabel={
        creating
          ? "Opening your listing…"
          : step === "review" && reviewed
            ? "Sending it to Operations…"
            : "Saving your listing…"
      }
      preview={
        showPreview && merged ? (
          <ClientPreviewCard
            listing={merged}
            services={boardServices}
            onPress={() =>
              void persistThen(() =>
                router.push({ pathname: "/shop/[id]/preview", params: { id: listingId ?? "" } }),
              )
            }
          />
        ) : null
      }
    >
      {step === "pick" ? (
        <PickStep
          choices={choices}
          categoryNames={categoryNames}
          typesLoading={typesLoading}
          typesError={typesError}
          onRetryTypes={loadTypes}
          query={typeQuery}
          onQuery={setTypeQuery}
          subcategoryCode={subcategoryCode}
          printerMaxWidthFeet={
            listingId && working ? working.printerMaxWidthFeet : printerMaxWidthFeet
          }
          starterId={starterId}
          starters={starters}
          startersLoading={startersLoading}
          starterError={starterError}
          created={committed}
          onType={(choice: ProductTypeChoice) => {
            if (listingId && choice.targetCategoryCode !== categoryCode) return;
            if (!listingId) setCategoryCode(choice.targetCategoryCode);
            setSubcategoryCode(choice.code);
            setPrinterMaxWidthFeet(null);
            if (working) {
              setDraft({
                ...working,
                subcategoryCode: choice.code,
                printerMaxWidthFeet: needsPrinterCap(choice.code) ? working.printerMaxWidthFeet : null,
              });
            }
          }}
          onRequestType={(name) =>
            router.push({ pathname: "/shop/request-type", params: name ? { name } : {} })
          }
          onPrinterCap={(value) => {
            setPrinterMaxWidthFeet(value);
            if (working) setDraft({ ...working, printerMaxWidthFeet: value });
          }}
          onStarter={setStarterId}
          onRetryStarters={retryStarters}
        />
      ) : null}

      {step === "about" && listing && working ? (
        <AboutStep
          listing={listing}
          working={working}
          onChange={setDraft}
          onPhotos={() =>
            void persistThen(() =>
              router.push({ pathname: "/shop/[id]/photos", params: { id: listing.id } }),
            )
          }
          onRemovePhoto={(fileId) => {
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
      ) : null}

      {step === "price" && working ? (
        <PriceStep working={working} onChange={setDraft} />
      ) : null}

      {step === "speed" && listing && working && context ? (
        <SpeedStep
          listing={listing}
          working={working}
          context={context}
          onChange={setDraft}
        />
      ) : null}

      {step === "steps" && listing && merged ? (
        <StepsStep
          listing={listing}
          merged={merged}
          busy={busy}
          onSetRequired={(group, required) => {
            void run(async () => saveGroup(listing, group, { required }));
          }}
          onAddOption={(group, label, minor, multiplier) =>
            run(async () =>
              addOption(group, {
                label,
                priceModifierMinor: minor,
                priceMultiplierBps: multiplier,
              }),
            )
          }
          onRemoveOption={(group, optionId) => {
            void run(async () => removeOption(group, optionId));
          }}
          onRemoveGroup={(group) => {
            void run(async () => removeGroup(listing, group));
          }}
          onAddGroup={(input) =>
            run(async () =>
              addGroup(listing, {
                name: input.name,
                kind: input.kind,
                required: input.required,
                firstOption: input.firstOption,
              }),
            )
          }
        />
      ) : null}

      {step === "artwork" && listing && working && context ? (
        <ArtworkStep
          working={working}
          context={context}
          formats={formats}
          prepSteps={prepSteps}
          prepStepsOpen={prepStepsOpen}
          busy={busy}
          onChange={setDraft}
          onReload={() => void reload()}
          onAddPrep={(input) =>
            run(async () => addPrepStep(listing, prepSteps, input), PREP_STEPS_NOT_OPEN_YET)
          }
          onRemovePrep={(stepId) => {
            void run(async () => removePrepStep(listing, stepId));
          }}
          onMovePrep={(from, to) => {
            void run(
              async () => reorderPrepSteps(listing, swap(prepSteps, from, to)),
              PREP_STEPS_NOT_OPEN_YET,
            );
          }}
        />
      ) : null}

      {step === "review" && listing && merged && context ? (
        <ReviewStep
          reviewed={reviewed}
          listing={merged}
          catalog={boardCatalog}
          services={boardServices}
          prepSteps={prepSteps}
          context={context}
          shopApproved={approved}
        />
      ) : null}

    </ListingWizardShell>
  );
}

function swap<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
