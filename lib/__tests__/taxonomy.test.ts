import { PUBLISHED_CATALOG } from "@/data/serviceCatalog";
import {
  allCoverage,
  buildCatalog,
  findCategory,
  resolveCategoryCode,
} from "@/lib/taxonomy";

/**
 * The shape `GET /taxonomy` serves — four flat collections, every reference a
 * category `code` on the referring record. See `gridgo-api/docs/TAXONOMY_API.md`.
 */
const PLATFORM_TAXONOMY = {
  categories: [
    {
      id: "taxc_recognition_awards_signage",
      code: "recognition_awards_signage",
      name: "Recognition, Awards & Signage",
      bestFor: "Competitions, graduations, guest speakers, store branding.",
      sortOrder: 3,
      productFamilyIds: ["card"],
      active: true,
    },
    {
      id: "taxc_marketing_collateral",
      code: "marketing_collateral",
      name: "Marketing & Promotional Collateral",
      bestFor: "Businesses, startups, and events.",
      sortOrder: 1,
      productFamilyIds: ["flyer"],
      active: true,
    },
    {
      id: "taxc_retired",
      code: "retired_category",
      name: "Retired",
      sortOrder: 9,
      active: false,
    },
  ],
  subcategories: [
    {
      id: "taxs_brochures",
      code: "brochures",
      name: "Brochures",
      categoryCode: "marketing_collateral",
      examples: ["Bi-fold", "tri-fold", "company profiles"],
      sortOrder: 2,
      active: true,
    },
    {
      id: "taxs_flyers",
      code: "flyers",
      name: "Flyers",
      categoryCode: "marketing_collateral",
      examples: ["Single sheets", "event promos"],
      sortOrder: 1,
      active: true,
    },
    {
      id: "taxs_medals_ribbons",
      code: "medals_ribbons",
      name: "Medals & Ribbons",
      categoryCode: "recognition_awards_signage",
      examples: ["Metal medals"],
      sortOrder: 3,
      active: true,
    },
    {
      id: "taxs_gone",
      code: "gone",
      name: "Gone",
      categoryCode: "marketing_collateral",
      examples: [],
      sortOrder: 9,
      active: false,
    },
  ],
  materials: [
    {
      id: "taxm_matte150",
      code: "matte_150gsm",
      name: "Matte 150gsm",
      categoryCodes: ["marketing_collateral"],
      active: true,
    },
    {
      id: "taxm_retired",
      code: "old_stock",
      name: "Old stock",
      categoryCodes: ["marketing_collateral"],
      active: false,
    },
  ],
  finishes: [
    {
      id: "taxf_lam",
      code: "lamination",
      name: "Lamination",
      categoryCodes: ["marketing_collateral", "recognition_awards_signage"],
      active: true,
    },
  ],
  categoryAliases: [
    {
      code: "offset",
      name: "Offset / digital sheet",
      categoryCode: "marketing_collateral",
      ambiguous: true,
      active: true,
    },
    {
      code: "signage",
      name: "Signage",
      categoryCode: "recognition_awards_signage",
      ambiguous: false,
      active: false,
    },
  ],
};

/** The vocabulary the platform served before the catalogue was published. */
const PRE_CHART_TAXONOMY = {
  categories: [
    { id: "taxc_large_format", code: "large_format", name: "Large format", active: true },
    { id: "taxc_offset", code: "offset", name: "Offset / digital sheet", active: true },
    { id: "taxc_apparel", code: "apparel_sublimation", name: "Apparel", active: true },
    { id: "taxc_signage", code: "signage", name: "Signage", active: true },
  ],
  materials: [],
  finishes: [],
};

describe("buildCatalog", () => {
  it("joins the flat collections into categories with what each one covers", () => {
    const catalog = buildCatalog(PLATFORM_TAXONOMY);

    expect(catalog.source).toBe("platform");
    expect(catalog.canDeclare).toBe(true);
    // Sorted by the platform's own order, not array position.
    expect(catalog.categories.map((c) => c.code)).toEqual([
      "marketing_collateral",
      "recognition_awards_signage",
    ]);
    expect(catalog.categories[0].bestFor).toBe("Businesses, startups, and events.");
    expect(catalog.categories[0].covers.map((s) => s.code)).toEqual(["flyers", "brochures"]);
  });

  it("rejoins the examples list into the chart's own line", () => {
    const catalog = buildCatalog(PLATFORM_TAXONOMY);
    const brochures = allCoverage(catalog).find((s) => s.code === "brochures");

    expect(brochures?.examples).toBe("Bi-fold, tri-fold, company profiles");
  });

  it("hides everything the platform marks inactive", () => {
    const catalog = buildCatalog(PLATFORM_TAXONOMY);

    expect(findCategory(catalog, "retired_category")).toBeNull();
    expect(allCoverage(catalog).map((s) => s.code)).not.toContain("gone");
    expect(
      findCategory(catalog, "marketing_collateral")?.materials.map((m) => m.code),
    ).toEqual(["matte_150gsm"]);
  });

  it("gives each category only the materials and finishes that reach it", () => {
    const catalog = buildCatalog(PLATFORM_TAXONOMY);
    const recognition = findCategory(catalog, "recognition_awards_signage");

    expect(recognition?.materials).toEqual([]);
    expect(recognition?.finishes.map((f) => f.code)).toEqual(["lamination"]);
  });

  it("resolves a retired code to the category it now means", () => {
    const catalog = buildCatalog(PLATFORM_TAXONOMY);

    expect(resolveCategoryCode(catalog, "offset")).toBe("marketing_collateral");
    // An inactive alias no longer resolves.
    expect(resolveCategoryCode(catalog, "signage")).toBe("signage");
    expect(resolveCategoryCode(catalog, "marketing_collateral")).toBe(
      "marketing_collateral",
    );
  });

  it("falls back to the published chart when the platform has no catalogue", () => {
    const catalog = buildCatalog(PRE_CHART_TAXONOMY);

    expect(catalog.source).toBe("published");
    expect(catalog.canDeclare).toBe(true);
    expect(catalog.categories).toHaveLength(PUBLISHED_CATALOG.length);
    expect(allCoverage(catalog)).toHaveLength(17);
    // Filed against a line the platform can actually express.
    expect(catalog.categories.map((c) => c.code)).toEqual([
      "offset",
      "apparel_sublimation",
      "signage",
      "specialized_prototyping",
    ]);
    // Nothing pre-chart reaches prototyping work, so it cannot be filed yet.
    expect(catalog.categories.map((c) => c.declarable)).toEqual([true, true, true, false]);
  });

  it("says nothing can be declared when the platform has no categories at all", () => {
    const catalog = buildCatalog({ categories: [] });

    expect(catalog.source).toBe("published");
    expect(catalog.canDeclare).toBe(false);
    expect(catalog.categories).toHaveLength(PUBLISHED_CATALOG.length);
  });

  it("survives a response that is not a taxonomy", () => {
    for (const input of [null, undefined, "nope", 42, { categories: "nope" }]) {
      const catalog = buildCatalog(input);
      expect(catalog.categories).toHaveLength(PUBLISHED_CATALOG.length);
      expect(catalog.canDeclare).toBe(false);
    }
  });

  it("never shows an internal code as a name", () => {
    for (const catalog of [buildCatalog(PLATFORM_TAXONOMY), buildCatalog(PRE_CHART_TAXONOMY)]) {
      for (const category of catalog.categories) {
        expect(category.name).not.toContain("_");
        for (const item of category.covers) {
          expect(item.name).not.toContain("_");
        }
      }
    }
  });
});
