import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useNavigation, type Href } from "expo-router";
import { ChevronRight } from "lucide-react-native";

import { BoardHuntField } from "@/components/BoardHuntField";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { PrinterCapField } from "@/components/listing/PrinterCapField";
import { ClientSeesBar } from "@/components/templates/ClientSeesBar";
import { MoreOptions } from "@/components/templates/MoreOptions";
import { PriceTable } from "@/components/templates/PriceTable";
import { ReadyTimeChips } from "@/components/templates/ReadyTimeChips";
import { TemplateFlowShell } from "@/components/templates/TemplateFlowShell";
import { TemplateTile, type TileState } from "@/components/templates/TemplateTile";
import { loadServiceLines } from "@/hooks/useBoard";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { isActiveLine } from "@/lib/supplierServices";
import { isPrinterCapSet, needsPrinterCap, type Listing, type ServiceLine } from "@/lib/listings";
import {
  draftRows,
  EMPTY_MORE,
  fromPriceLine,
  groupLabel,
  groupsOf,
  moreOptionsBlocker,
  moreOptionsBody,
  priceBlocker,
  priceErrors,
  pricesBody,
  readyByLine,
  readyChipLabel,
  serviceFor,
  templateProductHref,
  type DraftRow,
  type MoreOptionsDraft,
  type ProductTemplate,
  type ReadyTimeChip,
} from "@/lib/productTemplates";
import { addTemplateProduct, loadTemplateCatalogue, previewTemplateProduct } from "@/lib/productTemplatesApi";
import { buildCatalog, type ServiceCatalog } from "@/lib/taxonomy";
import { askConfirm } from "@/store/sheets";

type Step = 0 | 1 | 2;

/** One ticked product on its way through prices and ready time. */
type Draft = {
  template: ProductTemplate;
  rows: DraftRow[];
  printerFeet: number | null;
  readyTime: string | null;
  more: MoreOptionsDraft;
};

/**
 * Add a product in three screens (gridgo-supplier#268).
 *
 * 1. What you make — tick GRIDGO products from a photo grid.
 * 2. Prices — the full price of each option the shop makes.
 * 3. Ready time — one chip, one dated example, and More options folded.
 *
 * Ticking several runs steps 2 and 3 once for each, saying "Product 2 of 3".
 * The header chevron steps back through the flow before it leaves it, so a
 * shop never loses its prices to a tap meant for "back one".
 *
 * Against a GRIDGO without templates (production before the API release) this
 * screen hands over to today's builder at once, so no entry point is a dead
 * end. Today's builder also stays one tap away as "Make a custom product".
 */
export default function AddProductScreen() {
  const navigation = useNavigation();
  const colors = useThemeColors();
  const [step, setStep] = useState<Step>(0);
  const [query, setQuery] = useState({ q: "", group: "" });
  const [templates, setTemplates] = useState<ProductTemplate[] | null>(null);
  const [groups, setGroups] = useState<string[]>([]);
  const [chips, setChips] = useState<ReadyTimeChip[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceLine[]>([]);
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);

  const [ticked, setTicked] = useState<ProductTemplate[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [index, setIndex] = useState(0);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ name: string; listing: Listing }[]>([]);
  /** GRIDGO's ready-by example, remembered with the question it answers. */
  const [example, setExample] = useState<{ key: string | null; line: string | null; note: string | null }>({
    key: null,
    line: null,
    note: null,
  });
  const leaving = useRef(false);
  const done = saved.length > 0 && index >= drafts.length;

  /* ---------------------------------------------------------------- loading */

  const apply = useCallback((result: Awaited<ReturnType<typeof loadTemplateCatalogue>>, unfiltered: boolean) => {
    if (result.status === "not_open_yet") {
      // Production before the API release: today's builder, without a detour.
      leaving.current = true;
      router.replace("/shop/new");
      return;
    }
    if (result.status === "failed") {
      setLoadError(result.message);
      return;
    }
    setLoadError(null);
    setTemplates(result.value.templates);
    setChips(result.value.readyTimes);
    // The chips are built from the whole list, not from a search that narrowed it.
    if (unfiltered) setGroups(groupsOf(result.value.templates));
  }, []);

  const load = useCallback(
    async (next: { q: string; group: string }) => apply(await loadTemplateCatalogue(next), !next.q && !next.group),
    [apply],
  );

  useEffect(() => {
    let cancelled = false;
    void loadTemplateCatalogue(query).then((result) => {
      if (!cancelled) apply(result, !query.q && !query.group);
    });
    return () => {
      cancelled = true;
    };
  }, [apply, query]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadServiceLines(), api.getTaxonomy().catch(() => null)]).then(([lines, taxonomy]) => {
      if (cancelled) return;
      // Active lines first, so a product sits under the line GRIDGO matches on.
      setServices([...lines].sort((a, b) => Number(isActiveLine(b)) - Number(isActiveLine(a))));
      if (taxonomy) setCatalog(buildCatalog(taxonomy));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------- navigation */

  const goBack = useCallback(() => {
    setTried(false);
    setSaveError(null);
    if (step === 2) setStep(1);
    else if (step === 1 && index > 0) {
      setIndex(index - 1);
      setStep(2);
    } else setStep(0);
  }, [index, step]);

  // The chevron walks back through the steps before it leaves the flow.
  useEffect(() => {
    return navigation.addListener("beforeRemove", (event) => {
      if (leaving.current || done || step === 0) return;
      event.preventDefault();
      goBack();
    });
  }, [done, goBack, navigation, step]);

  /* ---------------------------------------------------------------- step 1 */

  function tileState(template: ProductTemplate): TileState {
    if (template.addedItemIds.length) return "added";
    if (!serviceFor(template, services, catalog)) return "no_service";
    return ticked.some((t) => t.id === template.id) ? "ticked" : "open";
  }

  async function pressTile(template: ProductTemplate) {
    const state = tileState(template);
    if (state === "added") {
      router.push(templateProductHref(template.addedItemIds[0]));
      return;
    }
    if (state === "no_service") {
      const go = await askConfirm({
        question: `Add ${template.name} to the services you offer?`,
        consequence:
          "GRIDGO lists a product only under a service you have. Add the service, then come back and tick it.",
        confirmLabel: "Open my services",
        cancelLabel: "Not now",
      });
      if (go) router.push("/services");
      return;
    }
    setTicked((current) =>
      current.some((t) => t.id === template.id) ? current.filter((t) => t.id !== template.id) : [...current, template],
    );
  }

  function startPrices() {
    if (!ticked.length) {
      setTried(true);
      return;
    }
    setTried(false);
    // Keep what was already typed for a product still ticked.
    setDrafts((current) =>
      ticked.map(
        (template) =>
          current.find((d) => d.template.id === template.id) ?? {
            template,
            rows: draftRows(template),
            printerFeet: null,
            readyTime: null,
            more: EMPTY_MORE,
          },
      ),
    );
    setSaved([]);
    setIndex(0);
    setStep(1);
  }

  /* ---------------------------------------------------------- steps 2 and 3 */

  const draft = drafts[index] ?? null;
  const patchDraft = useCallback(
    (next: Partial<Draft>) => setDrafts((current) => current.map((d, i) => (i === index ? { ...d, ...next } : d))),
    [index],
  );

  const errors = useMemo(() => (draft ? priceErrors(draft.rows) : {}), [draft]);
  const priceProblem = draft ? priceBlocker(draft.rows) : null;
  const capProblem =
    draft && needsPrinterCap(draft.template.subcategoryCode) && !isPrinterCapSet(draft.printerFeet)
      ? "Set how wide your printer prints, in feet."
      : null;

  function body(d: Draft): Record<string, unknown> | null {
    const service = serviceFor(d.template, services, catalog);
    if (!service) return null;
    return {
      templateId: d.template.id,
      supplierServiceId: service.id,
      readyTime: d.readyTime,
      prices: pricesBody(d.rows),
      ...(needsPrinterCap(d.template.subcategoryCode) ? { printerMaxWidthFeet: d.printerFeet } : {}),
      ...moreOptionsBody(d.more),
    };
  }

  function toReadyTime() {
    if (priceProblem || capProblem) {
      setTried(true);
      return;
    }
    setTried(false);
    setStep(2);
  }

  // GRIDGO's own ready-by example, asked again whenever the chip changes.
  const previewKey = draft && step === 2 && draft.readyTime ? `${draft.template.id}|${draft.readyTime}` : null;
  useEffect(() => {
    if (!previewKey || !draft) return;
    const request = body(draft);
    if (!request) return;
    let cancelled = false;
    // More options are not part of the example: a half-typed rush must not block the date.
    const { minimumOrderQuantity: _m, priceTiers: _p, speedTiers: _s, clientTips: _c, ...core } = request;
    void previewTemplateProduct(core).then((result) => {
      if (cancelled) return;
      if (result.status === "ok") {
        setExample({ key: previewKey, line: readyByLine(result.value.readyBy), note: null });
      } else {
        setExample({
          key: previewKey,
          line: null,
          note: result.status === "failed" ? result.message : "Clients see the date worked out on your hours.",
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // `draft` changes on every keystroke in More options; the example only follows the chip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  async function save() {
    if (!draft) return;
    const problem = !draft.readyTime ? "Choose when it is ready." : moreOptionsBlocker(draft.more);
    if (problem) {
      setTried(true);
      return;
    }
    const request = body(draft);
    if (!request) {
      setSaveError("Add this kind of work to the services you offer first.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const result = await addTemplateProduct(request);
    setSaving(false);
    if (result.status !== "ok") {
      setSaveError(
        result.status === "failed" ? result.message : "GRIDGO cannot take template products yet. Make a custom product instead.",
      );
      return;
    }
    setSaved((current) => [...current, { name: draft.template.name, listing: result.value }]);
    setTried(false);
    setIndex(index + 1);
    setStep(1);
  }

  /* ---------------------------------------------------------------- render */

  if (done) {
    return <SavedScreen saved={saved} />;
  }

  const queueLine = drafts.length > 1 && step > 0 && draft ? `Product ${index + 1} of ${drafts.length}: ${draft.template.name}` : null;
  const lastSaved = saved.length && step === 1 ? saved[saved.length - 1] : null;

  const focus = step === 0 ? (ticked[ticked.length - 1] ?? null) : (draft?.template ?? null);
  const clientSees = (
    <ClientSeesBar
      name={focus?.name ?? null}
      photoUrl={focus?.photoUrl ?? null}
      photoAlt={focus?.photoAlt}
      priceLine={draft && step > 0 ? fromPriceLine(draft.rows, draft.template.unit) : null}
      readyLine={draft && step > 0 ? readyChipLabel(chips, draft.readyTime) : null}
    />
  );

  if (step === 0) {
    return (
      <TemplateFlowShell
        step={0}
        title="What do you make?"
        subtitle="Tick everything you print. GRIDGO fills in the name, photo and description."
        clientSees={clientSees}
        actionLabel={ticked.length > 1 ? `Next: prices for ${ticked.length}` : "Next: prices"}
        actionHint="Sunod"
        onAction={startPrices}
        footNote={tried && !ticked.length ? "Tick at least one product you make." : null}
        busy={false}
        busyLabel=""
      >
        <Pressable
          onPress={() => router.push("/shop/setup-help" as Href)}
          accessibilityRole="button"
          accessibilityLabel="Let GRIDGO set it up. Send your price list."
          className="gg-touch mt-4 flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
          testID="setup-help-row"
        >
          <View className="min-w-0 flex-1">
            <Text className="text-body font-medium text-text-primary">Let GRIDGO set it up</Text>
            <Text className="text-caption text-text-muted">Send a photo of your price list, or a voice note</Text>
          </View>
          <ChevronRight size={20} color={colors.textMuted} aria-hidden />
        </Pressable>

        <View className="mt-4">
          <BoardHuntField
            value={query.q}
            onHunt={(q) => setQuery((current) => ({ ...current, q }))}
            placeholder="Search products"
            accessibilityLabel="Search GRIDGO products"
          />
        </View>

        {groups.length ? (
          <View className="mt-3 flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {["", ...groups].map((code) => {
              const on = query.group === code;
              return (
                <Pressable
                  key={code || "all"}
                  onPress={() => setQuery((current) => ({ ...current, group: code }))}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  className={[
                    "gg-touch justify-center rounded-pill border px-3",
                    on ? "border-accent bg-accent" : "border-outline bg-surface",
                  ].join(" ")}
                >
                  <Text className={on ? "text-caption font-medium text-accent-on" : "text-caption text-text-primary"}>
                    {code ? groupLabel(code) : "All"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {loadError && !templates ? (
          <View className="mt-6">
            <EmptyState title="GRIDGO's products did not load" body={loadError} actionLabel="Try again" onAction={() => void load(query)} />
          </View>
        ) : loadError ? (
          <View className="mt-4">
            <ErrorNotice message={loadError} onRetry={() => void load(query)} />
          </View>
        ) : null}

        {!templates && !loadError ? (
          <View className="-mx-1.5 mt-4 flex-row flex-wrap" accessibilityRole="progressbar" accessibilityLabel="Loading GRIDGO products">
            {[0, 1, 2, 3].map((key) => (
              <View key={key} className="w-1/2 px-1.5 pb-3">
                <SkeletonBlock className="h-56 w-full rounded-card" />
              </View>
            ))}
          </View>
        ) : null}

        {templates?.length ? (
          <View className="-mx-1.5 mt-4 flex-row flex-wrap">
            {templates.map((template) => (
              <View key={template.id} className="w-1/2 px-1.5 pb-3">
                <TemplateTile template={template} state={tileState(template)} onPress={() => void pressTile(template)} />
              </View>
            ))}
          </View>
        ) : null}

        {templates && !templates.length ? (
          <Text className="mt-6 text-body text-text-secondary">
            {query.q ? `Nothing called “${query.q}” yet.` : "Nothing in this group yet."}
          </Text>
        ) : null}

        {templates ? <NotInTheList /> : null}
      </TemplateFlowShell>
    );
  }

  if (!draft) return null;

  if (step === 1) {
    return (
      <TemplateFlowShell
        step={1}
        title={`Prices for ${draft.template.name}`}
        subtitle="Tick what you make and type its full price. Untick what you don't make."
        queueLine={queueLine}
        clientSees={clientSees}
        actionLabel="Next: ready time"
        actionHint="Sunod"
        onAction={toReadyTime}
        footNote={tried ? (priceProblem ?? capProblem) : null}
        busy={false}
        busyLabel=""
      >
        {lastSaved ? (
          <View className="gg-panel mt-4" accessibilityLiveRegion="polite">
            <Text className="text-body text-text-primary">
              {lastSaved.name} is saved. The GRIDGO team checks its prices today.
            </Text>
          </View>
        ) : null}
        {draft.template.optionLists.length ? (
          <Text className="mt-3 text-caption text-text-muted">
            {draft.template.optionLists.map((l) => `${l.name}: ${l.options.join(", ")}`).join("\n")}
          </Text>
        ) : null}
        <View className="mt-4">
          <PriceTable
            template={draft.template}
            rows={draft.rows}
            onChange={(rows) => patchDraft({ rows })}
            errors={errors}
            showErrors={tried}
          />
        </View>
        {needsPrinterCap(draft.template.subcategoryCode) ? (
          <View className="mt-5">
            <PrinterCapField value={draft.printerFeet} onChange={(printerFeet) => patchDraft({ printerFeet })} />
            {tried && capProblem ? <Text className="mt-1 text-caption text-error">{capProblem}</Text> : null}
          </View>
        ) : null}
        <Text className="mt-4 text-caption text-text-muted">
          Clients pay your price plus GRIDGO&apos;s service fee, added at checkout.
        </Text>
      </TemplateFlowShell>
    );
  }

  const moreProblem = moreOptionsBlocker(draft.more);
  return (
    <TemplateFlowShell
      step={2}
      title="When is it ready?"
      subtitle="Counted on your opening hours, from when the client's file is ready."
      queueLine={queueLine}
      clientSees={clientSees}
      actionLabel="Save product"
      actionHint="I-save"
      onAction={() => void save()}
      footNote={tried ? (!draft.readyTime ? "Choose when it is ready." : moreProblem) : null}
      busy={saving}
      busyLabel="Saving your product…"
    >
      <View className="mt-4">
        <ReadyTimeChips
          chips={chips}
          value={draft.readyTime}
          onChange={(readyTime) => patchDraft({ readyTime })}
          example={example.key === previewKey ? example.line : null}
          loadingExample={previewKey != null && example.key !== previewKey}
          exampleNote={example.key === previewKey ? example.note : null}
        />
      </View>
      <View className="mt-6">
        <MoreOptions value={draft.more} onChange={(more) => patchDraft({ more })} defaultTips={draft.template.clientTips} />
      </View>
      <Text className="mt-4 text-caption text-text-muted">
        The GRIDGO team checks the prices today. It goes live once they do, and we tell you.
      </Text>
      {saveError ? (
        <View className="mt-4">
          <ErrorNotice message={saveError} onRetry={() => void save()} retryLabel="Save again" />
        </View>
      ) : null}
    </TemplateFlowShell>
  );
}

/** "Not in the list?" — never a dead end: ask GRIDGO for it, or build it yourself. */
function NotInTheList() {
  return (
    <View className="gg-panel mt-4 gap-3" testID="not-in-list">
      <View className="gap-1">
        <Text className="text-body font-medium text-text-primary">Not in the list?</Text>
        <Text className="text-caption text-text-secondary">
          Ask GRIDGO to add it — about one working day, and we tell you. Or make it yourself with the full
          product builder; the GRIDGO team reviews it before it goes live.
        </Text>
      </View>
      <SecondaryButton label="Ask GRIDGO to add it" onPress={() => router.push("/shop/ask-template" as Href)} />
      <SecondaryButton label="Make a custom product" onPress={() => router.push("/shop/new")} />
    </View>
  );
}

/** The end of the flow: what was saved, what happens next, and the optional extras. */
function SavedScreen({ saved }: { saved: { name: string; listing: Listing }[] }) {
  return (
    <View className="gg-screen">
      <View className="gg-page flex-1 pt-6">
        <Text className="text-h2 text-text-primary">
          {saved.length === 1 ? `${saved[0].name} is saved` : `${saved.length} products saved`}
        </Text>
        <Text className="mt-2 text-body text-text-secondary">
          The GRIDGO team checks the prices today. Each one goes live once they do, and we tell you.
        </Text>
        <View className="mt-6 gap-2">
          {saved.map(({ name, listing }) => (
            <View key={listing.id} className="gg-card gap-3">
              <Text className="text-body font-medium text-text-primary">{name}</Text>
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <SecondaryButton
                    label="Add your photos"
                    onPress={() => router.push({ pathname: "/shop/[id]/photos", params: { id: listing.id } })}
                  />
                </View>
                <View className="flex-1">
                  <SecondaryButton
                    label="Open product"
                    onPress={() => router.push(templateProductHref(listing.id))}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
        <Text className="mt-3 text-caption text-text-muted">
          Your own photos get a &quot;Real photo&quot; badge. Extras like lamination are on the full product page.
        </Text>
      </View>
      <View className="border-t border-outline bg-surface px-4 pb-8 pt-3">
        <PrimaryButton label="Done" hint="Human na" onPress={() => router.navigate("/(tabs)/catalogues")} />
      </View>
    </View>
  );
}
