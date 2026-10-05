import { readPhotos, type BoardTarget, type SamplePhoto } from "@/lib/listings";
import { resolveCategoryCode, type ServiceCatalog } from "@/lib/taxonomy";

/**
 * The product types a shop picks from when it adds a listing, and the ones it
 * asked GRIDGO to add (gridgo-api `docs/SUPPLIER_CATALOG_API.md#listing-review-and-product-type-picker`).
 *
 * A product type is a taxonomy subcategory. Picking one never claims its whole
 * category and never widens what the shop is accredited for: a listing still
 * sits under one of the shop's own category lines, so the grid only offers the
 * types inside those lines. This is the only place the `/me/product-types` and
 * `/me/product-type-requests` shapes are read.
 */

export type ProductType = {
  code: string;
  name: string;
  categoryCode: string;
  /** A governed picture for the type, when GRIDGO has one. */
  imageUrl: string | null;
  /** At most one approved listing sample. Empty means the app's placeholder. */
  photo: SamplePhoto | null;
  /** The taxonomy's examples line, for the search and the tile's hint. */
  examples: string;
};

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function list(body: unknown, key: string): Raw[] {
  const value = isRecord(body) ? body[key] : body;
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function normalizeProductTypes(body: unknown): ProductType[] {
  return list(body, "productTypes")
    .map((raw): ProductType | null => {
      const code = str(raw.code);
      const name = str(raw.name);
      const categoryCode = str(raw.categoryCode);
      if (!code || !name || !categoryCode) return null;
      return {
        code,
        name,
        categoryCode,
        imageUrl: str(raw.imageUrl),
        photo: readPhotos(raw.photos)[0] ?? null,
        examples: Array.isArray(raw.examples)
          ? raw.examples.filter((entry): entry is string => typeof entry === "string").join(", ")
          : "",
      };
    })
    .filter((type): type is ProductType => type != null);
}

/** One tile on the picker, under the shop's line it would sit in. */
export type ProductTypeChoice = ProductType & {
  /** The shop's accredited category this type sits under. */
  targetCategoryCode: string;
};

/**
 * The types this shop can list, in its own lines' order.
 *
 * GRIDGO returns every active type. A type outside the shop's accreditation
 * has no line to sit under, so it is left out rather than offered and refused.
 * When GRIDGO has no picker yet, the taxonomy's own coverage stands in, without
 * pictures.
 */
export function productTypeChoices(
  types: ProductType[] | null,
  targets: BoardTarget[],
  catalog: ServiceCatalog | null,
): ProductTypeChoice[] {
  const out: ProductTypeChoice[] = [];
  for (const target of targets) {
    const code = target.category.code;
    if (types) {
      for (const type of types) {
        const resolved = catalog ? resolveCategoryCode(catalog, type.categoryCode) : type.categoryCode;
        if (resolved !== code || out.some((entry) => entry.code === type.code)) continue;
        out.push({ ...type, targetCategoryCode: code });
      }
      continue;
    }
    for (const cover of target.covers) {
      if (out.some((entry) => entry.code === cover.code)) continue;
      out.push({
        code: cover.code,
        name: cover.name,
        categoryCode: code,
        imageUrl: null,
        photo: null,
        examples: cover.examples,
        targetCategoryCode: code,
      });
    }
  }
  return out;
}

/**
 * The search on top of the grid. A filter over what is already loaded, so
 * typing never sends a request: name, code and examples, any order of words.
 */
export function filterProductTypes<T extends ProductType>(types: T[], query: string): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return types;
  return types.filter((type) => {
    const haystack = `${type.name} ${type.code.replace(/_/g, " ")} ${type.examples}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/* --------------------------------------------------------------------------
   Requests for a type GRIDGO does not list
   -------------------------------------------------------------------------- */

export type ProductTypeRequestStatus = "pending" | "approved" | "needs_revision";

export type ProductTypeRequest = {
  id: string;
  categoryCode: string;
  name: string;
  description: string;
  status: ProductTypeRequestStatus;
  /** Operations' reason when it sent the request back. */
  reason: string | null;
  createdAt: string | null;
};

const REQUEST_STATUSES: readonly ProductTypeRequestStatus[] = ["pending", "approved", "needs_revision"];

export function normalizeProductTypeRequest(raw: unknown): ProductTypeRequest | null {
  const record = isRecord(raw) && isRecord(raw.request) ? raw.request : raw;
  if (!isRecord(record)) return null;
  const id = str(record.id);
  const name = str(record.name);
  if (!id || !name) return null;
  const status = str(record.status);
  return {
    id,
    categoryCode: str(record.categoryCode) ?? "",
    name,
    description: str(record.description) ?? "",
    status: REQUEST_STATUSES.includes(status as ProductTypeRequestStatus)
      ? (status as ProductTypeRequestStatus)
      : "pending",
    reason: str(record.reason),
    createdAt: str(record.createdAt),
  };
}

/** Newest first, so the request a shop just sent is at the top. */
export function normalizeProductTypeRequests(body: unknown): ProductTypeRequest[] {
  return list(body, "requests")
    .map(normalizeProductTypeRequest)
    .filter((request): request is ProductTypeRequest => request != null)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/** A request's state in the board's own words. */
export const REQUEST_STATUS_LABEL: Record<ProductTypeRequestStatus, string> = {
  pending: "Pending review",
  approved: "Added",
  needs_revision: "Needs changes",
};

export const PRODUCT_TYPE_NAME_MAX = 120;
export const PRODUCT_TYPE_DESCRIPTION_MAX = 2000;

/** What stops a request being sent, or null when it can go. */
export function productTypeRequestBlocker(input: {
  categoryCode: string | null;
  name: string;
  description: string;
}): string | null {
  if (!input.categoryCode) return "Choose which of your categories it belongs under.";
  if (!input.name.trim()) return "Name the product type.";
  if (input.name.trim().length > PRODUCT_TYPE_NAME_MAX) {
    return `Keep the name to ${PRODUCT_TYPE_NAME_MAX} characters.`;
  }
  if (!input.description.trim()) return "Say what it is and how you make it.";
  if (input.description.trim().length > PRODUCT_TYPE_DESCRIPTION_MAX) {
    return "Keep the description to 2,000 characters.";
  }
  return null;
}
