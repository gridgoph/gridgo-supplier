import { ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BusyOverlay } from "@/components/BusyOverlay";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { SwitchRow } from "@/components/controls/SwitchRow";
import { PrinterCapField } from "@/components/listing/PrinterCapField";
import { ClientSeesBar } from "@/components/templates/ClientSeesBar";
import { MoreOptions } from "@/components/templates/MoreOptions";
import { PriceTable } from "@/components/templates/PriceTable";
import { ReadyTimeChips } from "@/components/templates/ReadyTimeChips";
import { spacing } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";
import { firstPhotoUrl, isPrinterCapSet, needsPrinterCap, type Listing } from "@/lib/listings";
import {
  draftRows,
  fromPriceLine,
  moreOptionsBlocker,
  moreOptionsBody,
  moreOptionsFrom,
  priceBlocker,
  priceErrors,
  pricesBody,
  readyByLine,
  readyChipLabel,
  templateStanding,
  type DraftRow,
  type MoreOptionsDraft,
  type ProductTemplate,
  type ReadyTimeChip,
} from "@/lib/productTemplates";
import {
  confirmTemplatePrices,
  loadReadyPreview,
  loadTemplateCatalogue,
  loadTemplateProduct,
  saveTemplateProduct,
  setLive,
} from "@/lib/productTemplatesApi";

type Form = { rows: DraftRow[]; readyTime: string | null; more: MoreOptionsDraft; printerFeet: number | null };

/**
 * One GRIDGO template product: its full price table, ready time, More
 * options and the Live / Hidden switch, on one page (gridgo-supplier#268).
 *
 * Three things a shop comes here to do, each with the one yellow action it
 * needs and no other:
 *
 * - **Confirm prices the GRIDGO team prepared.** Nothing goes live before
 *   this. Untouched, the action is "Confirm prices"; changed, it is "Save and
 *   confirm" — saving a corrected table also confirms it.
 * - **Change prices.** "Save changes" appears only when something changed, and
 *   the page says that a new price is for new orders only.
 * - **Hide it or make it live.** A switch, instant, even while a price check
 *   is pending.
 */
export default function TemplateProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [listing, setListing] = useState<Listing | null>(null);
  const [template, setTemplate] = useState<ProductTemplate | null>(null);
  const [chips, setChips] = useState<ReadyTimeChip[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [initial, setInitial] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [example, setExample] = useState<{ key: string | null; line: string | null }>({ key: null, line: null });

  const apply = useCallback((product: Awaited<ReturnType<typeof loadTemplateProduct>>, catalogue: Awaited<ReturnType<typeof loadTemplateCatalogue>>) => {
    setLoadError(null);
    if (product.status !== "ok") {
      setLoadError(product.status === "failed" ? product.message : "GRIDGO cannot open this product on this app yet.");
      return;
    }
    const item = product.value.listing;
    const templates = catalogue.status === "ok" ? catalogue.value.templates : [];
    // An unpriced product moved over without a template picks the one GRIDGO
    // offers for its kind of work; saving its prices records that choice.
    const sameKind = templates.filter((t) => t.subcategoryCode === item.subcategoryCode);
    const found =
      templates.find((t) => t.id === item.template?.templateId) ??
      (!item.template?.templateId && sameKind.length === 1 ? sameKind[0] : null);
    setListing(item);
    setChips(catalogue.status === "ok" ? catalogue.value.readyTimes : []);
    setTemplate(found);
    if (!found) {
      setLoadError(
        "This product has no GRIDGO price table yet. Change it in the full product builder, or message the GRIDGO team.",
      );
      return;
    }
    const next: Form = {
      rows: draftRows(found, product.value.prices),
      readyTime: item.template?.readyTime ?? null,
      printerFeet: item.printerMaxWidthFeet,
      more: moreOptionsFrom({
        minimumOrderQuantity: item.minimumOrderQuantity,
        priceTiers: item.priceTiers,
        speedTiers: item.speedTiers,
        clientTips: item.template?.clientTips ?? [],
        templateTips: found.clientTips,
      }),
    };
    setForm(next);
    setInitial(JSON.stringify(next));
    setTried(false);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    const [product, catalogue] = await Promise.all([loadTemplateProduct(id), loadTemplateCatalogue()]);
    apply(product, catalogue);
  }, [apply, id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void Promise.all([loadTemplateProduct(id), loadTemplateCatalogue()]).then(([product, catalogue]) => {
      if (!cancelled) apply(product, catalogue);
    });
    return () => {
      cancelled = true;
    };
  }, [apply, id]);

  // GRIDGO's dated example for the chosen chip.
  const readyTime = form?.readyTime ?? null;
  useEffect(() => {
    if (!id || !readyTime) return;
    let cancelled = false;
    void loadReadyPreview(id, readyTime).then((result) => {
      if (cancelled) return;
      setExample({ key: readyTime, line: result.status === "ok" ? readyByLine(result.value) : null });
    });
    return () => {
      cancelled = true;
    };
  }, [id, readyTime]);

  const errors = useMemo(() => (form ? priceErrors(form.rows) : {}), [form]);
  const dirty = form != null && JSON.stringify(form) !== initial;
  const standing = listing ? templateStanding(listing) : null;
  const toConfirm = listing?.template?.shopConfirmed === false;
  const needsPrice = listing?.template?.needsPrice === true;

  function problem(): string | null {
    if (!form || !template || !listing) return null;
    return (
      priceBlocker(form.rows) ??
      (needsPrinterCap(template.subcategoryCode) && !isPrinterCapSet(form.printerFeet)
        ? "Set how wide your printer prints, in feet."
        : null) ??
      (!form.readyTime ? "Choose when it is ready." : null) ??
      moreOptionsBlocker(form.more)
    );
  }

  async function save() {
    if (!form || !template || !listing) return;
    if (problem()) {
      setTried(true);
      return;
    }
    setBusy(toConfirm ? "Saving and confirming…" : "Saving your prices…");
    setError(null);
    setNotice(null);
    const result = await saveTemplateProduct(listing, {
      templateId: template.id,
      readyTime: form.readyTime,
      prices: pricesBody(form.rows),
      ...(needsPrinterCap(template.subcategoryCode) ? { printerMaxWidthFeet: form.printerFeet } : {}),
      ...moreOptionsBody(form.more),
    });
    setBusy(null);
    if (result.status !== "ok") {
      setError(result.status === "failed" ? result.message : "GRIDGO cannot save template products on this app yet.");
      return;
    }
    await load();
    setNotice(
      toConfirm || needsPrice
        ? "Saved. The GRIDGO team checks the prices today, and we tell you when it is live."
        : "Saved. New prices are for new orders only; orders already placed keep their price.",
    );
  }

  async function confirm() {
    if (!listing) return;
    setBusy("Confirming prices…");
    setError(null);
    setNotice(null);
    const result = await confirmTemplatePrices(listing);
    setBusy(null);
    if (result.status !== "ok") {
      setError(result.status === "failed" ? result.message : "GRIDGO cannot confirm prices on this app yet.");
      return;
    }
    await load();
    setNotice("Confirmed. The GRIDGO team checks the prices today, and we tell you when it is live.");
  }

  async function toggleLive(next: boolean) {
    if (!listing) return;
    setBusy(next ? "Making it live…" : "Hiding it…");
    setError(null);
    setNotice(null);
    const result = await setLive(listing, next);
    setBusy(null);
    if (result.status !== "ok") {
      setError(result.status === "failed" ? result.message : "GRIDGO cannot change this on this app yet.");
      await load();
      return;
    }
    setListing(result.value);
    setNotice(next ? "Live. Clients can order it." : "Hidden. Clients cannot see it. Your prices are kept.");
  }

  if (!listing || !form || !template) {
    return (
      <View className="gg-screen">
        <View className="gg-page gap-3 pt-4">
          {loadError ? (
            <EmptyState
              title="This product did not open here"
              body={loadError}
              actionLabel="Try again"
              onAction={() => void load()}
              secondaryLabel={id ? "Open the full product builder" : undefined}
              onSecondary={id ? () => router.replace({ pathname: "/shop/[id]", params: { id } }) : undefined}
            />
          ) : (
            <>
              <SkeletonBlock className="h-20 w-full rounded-card" />
              <SkeletonBlock className="h-40 w-full rounded-card" />
              <SkeletonBlock className="h-40 w-full rounded-card" />
            </>
          )}
        </View>
      </View>
    );
  }

  const action = toConfirm
    ? dirty
      ? { label: "Save and confirm", hint: "I-save ug kumpirmahon", run: save }
      : { label: "Confirm prices", hint: "Kumpirmahon ang presyo", run: confirm }
    : dirty
      ? { label: needsPrice ? "Save prices" : "Save changes", hint: "I-save", run: save }
      : null;
  const footProblem = tried ? problem() : null;

  return (
    <View className="gg-screen">
      <FormScrollView contentClassName="gg-page pb-10 pt-4" bottomOffset={spacing.xxl}>
        <Text className="text-h2 text-text-primary">{listing.name || template.name}</Text>
        {standing ? (
          <View className="mt-2 gap-1">
            <View className="flex-row">
              <StatusChip tone={standing.tone} icon={standing.icon} label={standing.label} />
            </View>
            {standing.detail ? <Text className="text-caption text-text-secondary">{standing.detail}</Text> : null}
          </View>
        ) : null}

        {notice ? (
          <View className="gg-panel mt-4" accessibilityLiveRegion="polite" testID="product-notice">
            <Text className="text-body text-text-primary">{notice}</Text>
          </View>
        ) : null}
        {error ? (
          <View className="mt-4">
            <ErrorNotice message={error} />
          </View>
        ) : null}

        {standing?.switchable ? (
          <View className="mt-5">
            <SwitchRow
              value={listing.onTheBoard}
              onChange={(next) => void toggleLive(next)}
              label={listing.onTheBoard ? "Live" : "Hidden"}
              hint="Hiding is instant. Your prices are kept."
              disabled={busy != null}
            />
          </View>
        ) : null}

        <Text className="mt-6 text-h3 text-text-primary">Prices</Text>
        <Text className="mt-1 text-caption text-text-muted">
          {toConfirm
            ? "Check each price the GRIDGO team filled in. Change any that are wrong."
            : "Full price for each option you make. A new price is for new orders only."}
        </Text>
        <View className="mt-3">
          <PriceTable
            template={template}
            rows={form.rows}
            onChange={(rows) => setForm({ ...form, rows })}
            errors={errors}
            showErrors={tried}
            flagged={listing.template?.flaggedOptionKeys}
          />
        </View>
        {needsPrinterCap(template.subcategoryCode) ? (
          <View className="mt-5">
            <PrinterCapField value={form.printerFeet} onChange={(printerFeet) => setForm({ ...form, printerFeet })} />
          </View>
        ) : null}

        <Text className="mt-6 text-h3 text-text-primary">Ready time</Text>
        <View className="mt-3">
          <ReadyTimeChips
            chips={chips}
            value={form.readyTime}
            onChange={(next) => setForm({ ...form, readyTime: next })}
            example={example.key === form.readyTime ? example.line : null}
            loadingExample={form.readyTime != null && example.key !== form.readyTime}
          />
        </View>

        <View className="mt-6">
          <MoreOptions
            value={form.more}
            onChange={(more) => setForm({ ...form, more })}
            defaultTips={template.clientTips}
            afterSave={
              <View className="gap-2">
                <LinkRow
                  title="Your own photos"
                  detail={
                    listing.photos.some((p) => p.realPhoto)
                      ? "Shown with a “Real photo” badge"
                      : "Replace GRIDGO's photo with your own work"
                  }
                  onPress={() => router.push({ pathname: "/shop/[id]/photos", params: { id: listing.id } })}
                  color={colors.textMuted}
                />
                <LinkRow
                  title="Extras"
                  detail="Lamination, rounded corners and other add-ons. The GRIDGO team reviews them."
                  onPress={() => router.push({ pathname: "/shop/[id]", params: { id: listing.id, full: "1" } })}
                  color={colors.textMuted}
                />
              </View>
            }
          />
        </View>
      </FormScrollView>

      <ClientSeesBar
        name={listing.name || template.name}
        photoUrl={firstPhotoUrl(listing) ?? template.photoUrl}
        photoAlt={template.photoAlt}
        priceLine={fromPriceLine(form.rows, template.unit)}
        readyLine={readyChipLabel(chips, form.readyTime)}
        realPhoto={listing.photos[0]?.realPhoto === true}
      />

      {action ? (
        <View className="border-t border-outline bg-surface px-4 pt-3" style={{ paddingBottom: insets.bottom + spacing.md }}>
          {footProblem ? (
            <Text className="mb-2 text-caption text-text-secondary" accessibilityLiveRegion="polite" testID="flow-foot-note">
              {footProblem}
            </Text>
          ) : null}
          <PrimaryButton label={action.label} hint={action.hint} onPress={() => void action.run()} />
        </View>
      ) : null}

      <BusyOverlay visible={busy != null} label={busy ?? ""} />
    </View>
  );
}

function LinkRow({ title, detail, onPress, color }: { title: string; detail: string; onPress: () => void; color: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-3 py-2.5"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-body font-medium text-text-primary">{title}</Text>
        <Text className="text-caption text-text-muted">{detail}</Text>
      </View>
      <ChevronRight size={18} color={color} aria-hidden />
    </Pressable>
  );
}
