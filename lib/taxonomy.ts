import { PUBLISHED_CATALOG, LEGACY_CODE_FOR_CATEGORY } from "@/data/serviceCatalog";

/**
 * The shop-facing product catalogue.
 *
 * `GET /taxonomy` is the source of truth and this module is the only place that
 * reads its shape. The contract is `docs/TAXONOMY_API.md` in `gridgo-api`:
 * categories, subcategories, materials and finishes are four flat collections,
 * and every reference is a category `code` held on the referring record.
 *
 * Two things follow, and both shape the screens:
 *
 * - A **category** is the unit GRIDGO accredits. A supplier service line holds
 *   one `categoryCode`, so a shop declares a category, not a subcategory.
 * - A **subcategory** is what that category covers. It carries the chart's
 *   examples and is what tells a shop exactly what it is committing to.
 *
 * Retired pre-chart codes (`large_format`, `offset`, …) live on in
 * `categoryAliases`, so a service line stored before the migration still
 * resolves to a category — `resolveCategoryCode` is how.
 */

/** One subcategory: what a category covers, in the chart's own words. */
export type CatalogCoverage = {
  code: string;
  name: string;
  /** The chart's examples line, rejoined for display. */
  examples: string;
};

/** A material or finish a shop can be accredited for inside a category. */
export type CatalogTerm = {
  code: string;
  name: string;
};

export type CatalogCategory = {
  /** The code a supplier service line is filed under. */
  code: string;
  name: string;
  /** The chart's "best for" line, without its prefix. */
  bestFor: string;
  covers: CatalogCoverage[];
  materials: CatalogTerm[];
  finishes: CatalogTerm[];
  /**
   * False when the platform has no line this category could be filed against —
   * only reachable on a platform that has not published the catalogue yet.
   */
  declarable: boolean;
};

export type CatalogSource = "platform" | "published";

export type ServiceCatalog = {
  categories: CatalogCategory[];
  /** "platform" when GRIDGO served the catalogue; "published" when the app is
   *  falling back to the chart because the platform has not migrated yet. */
  source: CatalogSource;
  /** False when nothing here can be filed against the platform as it stands. */
  canDeclare: boolean;
  /** Retired code → the category it now means. */
  aliases: Record<string, string>;
};

/** Anything `GET /taxonomy` may hold. Read defensively, never trusted. */
type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value != null;
}

function asArray(value: unknown): Raw[] {
  return Array.isArray(value) ? value.filter((v): v is Raw => isRecord(v)) : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isActive(entry: Raw): boolean {
  return entry.active !== false;
}

/** `examples` is a list of items; the chart's original line is them joined. */
function examplesLine(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").join(", ");
  }
  return str(value) ?? "";
}

function sortByOrder(a: Raw, b: Raw): number {
  const ao = typeof a.sortOrder === "number" ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const bo = typeof b.sortOrder === "number" ? b.sortOrder : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return String(a.code ?? "").localeCompare(String(b.code ?? ""));
}

function termsFor(entries: Raw[], categoryCode: string): CatalogTerm[] {
  const terms: CatalogTerm[] = [];
  for (const entry of entries) {
    if (!isActive(entry)) continue;
    const codes = entry.categoryCodes;
    if (!Array.isArray(codes) || !codes.includes(categoryCode)) continue;
    const code = str(entry.code);
    const name = str(entry.name);
    if (code && name) terms.push({ code, name });
  }
  return terms;
}

/** The chart as this app ships it, filed under whatever the platform has. */
function fromPublishedChart(liveCodes: Set<string>): ServiceCatalog {
  let declarableCount = 0;
  const categories = PUBLISHED_CATALOG.map((category) => {
    const legacy = LEGACY_CODE_FOR_CATEGORY[category.code];
    // Keep the published code as identity; only the code a line is filed under
    // falls back, and only when the platform actually has one.
    const code = liveCodes.has(category.code)
      ? category.code
      : legacy && liveCodes.has(legacy)
        ? legacy
        : category.code;
    const declarable = liveCodes.has(code);
    if (declarable) declarableCount += 1;
    return {
      code,
      name: category.name,
      bestFor: category.audience,
      covers: category.services.map((service) => ({
        code: service.code,
        name: service.name,
        examples: service.examples,
      })),
      materials: [],
      finishes: [],
      declarable,
    };
  });

  return {
    categories,
    source: "published",
    canDeclare: declarableCount > 0,
    aliases: {},
  };
}

/**
 * Normalise `GET /taxonomy` into the catalogue a shop picks from.
 *
 * Pure, so the mapping can be tested against the vocabulary the platform serves
 * now and the one it served before the catalogue was published.
 */
export function buildCatalog(taxonomy: unknown): ServiceCatalog {
  const root = isRecord(taxonomy) ? taxonomy : {};
  const rawCategories = asArray(root.categories).filter(isActive);
  const rawSubcategories = asArray(root.subcategories).filter(isActive);
  const materials = asArray(root.materials);
  const finishes = asArray(root.finishes);

  const aliases: Record<string, string> = {};
  for (const alias of asArray(root.categoryAliases)) {
    if (!isActive(alias)) continue;
    const from = str(alias.code);
    const to = str(alias.categoryCode);
    if (from && to) aliases[from] = to;
  }

  const liveCodes = new Set<string>();
  for (const category of rawCategories) {
    const code = str(category.code);
    if (code) liveCodes.add(code);
  }

  // No published catalogue yet — the platform is still on the pre-chart codes.
  if (!rawSubcategories.length) return fromPublishedChart(liveCodes);

  const categories: CatalogCategory[] = [];
  for (const raw of [...rawCategories].sort(sortByOrder)) {
    const code = str(raw.code);
    const name = str(raw.name);
    if (!code || !name) continue;

    const covers: CatalogCoverage[] = [];
    for (const sub of rawSubcategories.filter((s) => str(s.categoryCode) === code).sort(sortByOrder)) {
      const subCode = str(sub.code);
      const subName = str(sub.name);
      if (!subCode || !subName) continue;
      covers.push({ code: subCode, name: subName, examples: examplesLine(sub.examples) });
    }

    categories.push({
      code,
      name,
      bestFor: str(raw.bestFor) ?? str(raw.audience) ?? str(raw.description) ?? "",
      covers,
      materials: termsFor(materials, code),
      finishes: termsFor(finishes, code),
      declarable: true,
    });
  }

  if (!categories.length) return fromPublishedChart(liveCodes);

  return { categories, source: "platform", canDeclare: true, aliases };
}

/**
 * The category a stored code means today.
 *
 * A service line filed before the catalogue was published still holds a retired
 * code, and grouping it under a category heading has to go through the alias or
 * the shop's own accredited work would silently disappear from this screen.
 */
export function resolveCategoryCode(catalog: ServiceCatalog, code: string): string {
  return catalog.aliases[code] ?? code;
}

export function findCategory(
  catalog: ServiceCatalog,
  code: string | undefined,
): CatalogCategory | null {
  if (!code) return null;
  return catalog.categories.find((category) => category.code === code) ?? null;
}

/** Every subcategory in the catalogue, flattened. */
export function allCoverage(catalog: ServiceCatalog): CatalogCoverage[] {
  return catalog.categories.flatMap((category) => category.covers);
}
