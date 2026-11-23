import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { invalidate } from "@/lib/live";
import { normalizeListing, type Listing } from "@/lib/listings";
import type { BoardOutcome } from "@/lib/listingsApi";
import { normalizePreview, type ProductionTimePreview } from "@/lib/productionTimePreview";
import {
  normalizeCatalogue,
  normalizePriceRows,
  normalizeSetupRequest,
  normalizeSetupRequests,
  type PriceRow,
  type SetupRequest,
  type TemplateCatalogue,
} from "@/lib/productTemplates";

/**
 * Product template calls against a GRIDGO that may not have them yet.
 *
 * The same three outcomes as the board (`lib/listingsApi.ts`): a 404 or 405 is
 * `not_open_yet` — production before the API release — and the screens answer
 * it by keeping today's builder, never with a red error. Every write tells the
 * board to reload (`invalidate("catalog")`).
 */

function isRouteAbsent(error: unknown): boolean {
  return error instanceof api.ApiError && (error.status === 404 || error.status === 405);
}

/** A 404 that names a code is GRIDGO refusing, not a missing route. */
function isNamedRefusal(error: unknown): boolean {
  if (!(error instanceof api.ApiError)) return false;
  const body = error.body;
  const code = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : "";
  return code !== "" && code !== "not_found";
}

async function attempt<T>(subject: string, call: () => Promise<T>, write = false): Promise<BoardOutcome<T>> {
  try {
    const value = await call();
    if (write) invalidate("catalog");
    return { status: "ok", value };
  } catch (error) {
    if (isRouteAbsent(error) && !isNamedRefusal(error)) return { status: "not_open_yet" };
    return { status: "failed", message: humanizeApiError(error, offlineMessage(subject)) };
  }
}

const UNREADABLE = "GRIDGO sent this product in a shape this version of the app cannot read. Update GRIDGO Supplier.";

function listingOf(body: unknown): Listing {
  const listing = normalizeListing(body);
  if (!listing) throw new api.ApiError(502, { error: "unreadable", message: UNREADABLE });
  return listing;
}

export async function loadTemplateCatalogue(
  query: { q?: string; group?: string } = {},
): Promise<BoardOutcome<TemplateCatalogue>> {
  return attempt("load GRIDGO products", async () => normalizeCatalogue(await api.listProductTemplates(query)));
}

/** Is the template flow open on this GRIDGO? Quiet: anything but a clear yes is no. */
export async function templatesOpen(): Promise<boolean> {
  const result = await loadTemplateCatalogue();
  return result.status === "ok" && result.value.templates.length > 0;
}

export type ProductPreview = { listing: Listing | null; readyBy: ProductionTimePreview | null };

/** The client's view and a ready-by example for a table not saved yet. */
export async function previewTemplateProduct(body: Record<string, unknown>): Promise<BoardOutcome<ProductPreview>> {
  return attempt("show the ready-by date", async () => {
    const raw = (await api.previewTemplateProduct(body)) as Record<string, unknown> | null;
    return { listing: normalizeListing(raw?.item), readyBy: normalizePreview(raw) };
  });
}

/** The ready-by example for a saved product under another chip. */
export async function loadReadyPreview(itemId: string, readyTime: string): Promise<BoardOutcome<ProductionTimePreview | null>> {
  return attempt("show the ready-by date", async () => normalizePreview(await api.templateReadyPreview(itemId, readyTime)));
}

export async function addTemplateProduct(body: Record<string, unknown>): Promise<BoardOutcome<Listing>> {
  return attempt("save this product", async () => listingOf(await api.createTemplateProduct(body)), true);
}

export type TemplateProduct = { listing: Listing; prices: PriceRow[] };

export async function loadTemplateProduct(itemId: string): Promise<BoardOutcome<TemplateProduct>> {
  return attempt("open this product", async () => {
    const raw = (await api.getTemplateProduct(itemId)) as Record<string, unknown> | null;
    return { listing: listingOf(raw), prices: normalizePriceRows(raw?.prices) };
  });
}

/** Save the whole table. On a GRIDGO-prepared product this also confirms its prices. */
export async function saveTemplateProduct(
  listing: Listing,
  body: Record<string, unknown>,
): Promise<BoardOutcome<Listing>> {
  return attempt(
    "save this product",
    async () => listingOf(await api.updateTemplateProduct(listing.id, listing.version, body)),
    true,
  );
}

export async function confirmTemplatePrices(listing: Listing): Promise<BoardOutcome<Listing>> {
  return attempt(
    "confirm these prices",
    async () => listingOf(await api.confirmTemplateProduct(listing.id, listing.version)),
    true,
  );
}

/** Live or Hidden. Hiding is instant, even while a price check is pending. */
export async function setLive(listing: Listing, live: boolean): Promise<BoardOutcome<Listing>> {
  return attempt(
    live ? "make this product live" : "hide this product",
    async () => listingOf(await api.updateCatalogItem(listing.id, listing.version, { active: live })),
    true,
  );
}

export async function askForTemplate(input: { name: string; message: string }): Promise<BoardOutcome<SetupRequest>> {
  return attempt("send your request", async () => {
    const raw = (await api.createProductSetupRequest({
      kind: "template",
      requestedName: input.name.trim(),
      message: input.message.trim(),
    })) as Record<string, unknown> | null;
    const request = normalizeSetupRequest(raw?.request);
    if (!request) throw new api.ApiError(502, { error: "unreadable" });
    return request;
  });
}

export async function askForSetup(input: { message: string; fileIds: string[] }): Promise<BoardOutcome<SetupRequest>> {
  return attempt("send this to the GRIDGO team", async () => {
    const body: { kind: "setup"; message?: string; fileIds?: string[] } = { kind: "setup" };
    if (input.message.trim()) body.message = input.message.trim();
    if (input.fileIds.length) body.fileIds = input.fileIds;
    const raw = (await api.createProductSetupRequest(body)) as Record<string, unknown> | null;
    const request = normalizeSetupRequest(raw?.request);
    if (!request) throw new api.ApiError(502, { error: "unreadable" });
    return request;
  });
}

export async function loadSetupRequests(): Promise<BoardOutcome<SetupRequest[]>> {
  return attempt("load your requests", async () => normalizeSetupRequests(await api.listProductSetupRequests()));
}
