import {
  filterProductTypes,
  normalizeProductTypeRequests,
  normalizeProductTypes,
  productTypeChoices,
  productTypeRequestBlocker,
} from "@/lib/productTypes";
import type { BoardTarget } from "@/lib/listings";
import type { ServiceCatalog } from "@/lib/taxonomy";

const catalog: ServiceCatalog = {
  source: "platform",
  canDeclare: true,
  aliases: { marketing_promotional: "marketing_collateral" },
  categories: [
    {
      code: "marketing_collateral",
      name: "Marketing collateral",
      bestFor: "",
      declarable: true,
      materials: [],
      finishes: [],
      covers: [
        { code: "flyers", name: "Flyers", examples: "Handouts" },
        { code: "business_cards", name: "Business Cards", examples: "Name cards" },
      ],
    },
  ],
};

const target: BoardTarget = {
  service: {
    id: "svc_1",
    categoryCode: "marketing_collateral",
    state: "live",
    turnaroundDays: 1,
    formatCodes: ["pdf"],
  },
  category: catalog.categories[0],
  covers: catalog.categories[0].covers,
};

const BODY = {
  productTypes: [
    {
      code: "flyers",
      name: "Flyers",
      categoryCode: "marketing_collateral",
      imageUrl: null,
      photos: [
        {
          fileId: "file_lovis",
          sortOrder: 0,
          altText: "Flyers",
          downloadUrl: "https://example.test/flyers.jpg",
          downloadUrlExpiresAt: "2999-01-01T00:00:00.000Z",
        },
      ],
      starters: [],
    },
    { code: "business_cards", name: "Business Cards", categoryCode: "marketing_collateral", photos: [] },
    { code: "plaques_trophies", name: "Plaques & Trophies", categoryCode: "recognition_awards_signage", photos: [] },
    { name: "No code" },
  ],
};

describe("the product-type picker", () => {
  it("reads each type with its one approved sample, and drops what it cannot read", () => {
    const types = normalizeProductTypes(BODY);
    expect(types.map((type) => type.code)).toEqual(["flyers", "business_cards", "plaques_trophies"]);
    expect(types[0].photo?.downloadUrl).toBe("https://example.test/flyers.jpg");
    expect(types[1].photo).toBeNull();
  });

  it("offers only types inside the shop's own accredited categories", () => {
    const choices = productTypeChoices(normalizeProductTypes(BODY), [target], catalog);
    expect(choices.map((choice) => choice.code)).toEqual(["flyers", "business_cards"]);
    expect(choices[0].targetCategoryCode).toBe("marketing_collateral");
  });

  it("falls back to the chart's own coverage when GRIDGO has no picker", () => {
    const choices = productTypeChoices(null, [target], catalog);
    expect(choices.map((choice) => choice.code)).toEqual(["flyers", "business_cards"]);
    expect(choices.every((choice) => choice.photo == null)).toBe(true);
  });

  it("filters by any word of the name, the code or the examples", () => {
    const choices = productTypeChoices(null, [target], catalog);
    expect(filterProductTypes(choices, "  ").length).toBe(2);
    expect(filterProductTypes(choices, "card").map((choice) => choice.code)).toEqual(["business_cards"]);
    expect(filterProductTypes(choices, "handouts").map((choice) => choice.code)).toEqual(["flyers"]);
    expect(filterProductTypes(choices, "keychain")).toEqual([]);
  });
});

describe("asking for a new product type", () => {
  it("reads the shop's requests newest first, with Operations' reason", () => {
    const requests = normalizeProductTypeRequests({
      requests: [
        { id: "ptr_1", name: "Pins", categoryCode: "c", status: "approved", createdAt: "2026-10-01T00:00:00Z" },
        {
          id: "ptr_2",
          name: "Keychains",
          categoryCode: "c",
          status: "needs_revision",
          reason: "Say the material",
          createdAt: "2026-10-04T00:00:00Z",
        },
      ],
    });
    expect(requests.map((request) => request.id)).toEqual(["ptr_2", "ptr_1"]);
    expect(requests[0].reason).toBe("Say the material");
  });

  it("names what stops a request being sent", () => {
    expect(productTypeRequestBlocker({ categoryCode: null, name: "x", description: "y" })).toContain("categor");
    expect(productTypeRequestBlocker({ categoryCode: "c", name: " ", description: "y" })).toBe("Name the product type.");
    expect(productTypeRequestBlocker({ categoryCode: "c", name: "Pins", description: "" })).toBe(
      "Say what it is and how you make it.",
    );
    expect(productTypeRequestBlocker({ categoryCode: "c", name: "Pins", description: "Enamel pins" })).toBeNull();
  });
});
