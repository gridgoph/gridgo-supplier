import type { SupplierService } from "@/lib/api";
import {
  capabilityChanged,
  capabilityDraftFor,
  catalogTotals,
  declarationFor,
  declarationsFor,
  expandsCapability,
  presentLifecycle,
  presentServiceState,
  serviceLifecycle,
  submittableLineIds,
  toggleCode,
} from "@/lib/supplierServices";
import type { CatalogCategory, ServiceCatalog } from "@/lib/taxonomy";

const MARKETING: CatalogCategory = {
  code: "marketing_collateral",
  name: "Marketing & Promotional Collateral",
  bestFor: "Businesses, startups, and events.",
  covers: [
    { code: "flyers", name: "Flyers", examples: "Single sheets" },
    { code: "brochures", name: "Brochures", examples: "Bi-fold, tri-fold" },
  ],
  materials: [
    { code: "matte_150gsm", name: "Matte 150gsm" },
    { code: "gloss_cardstock", name: "Gloss cardstock" },
  ],
  finishes: [{ code: "lamination", name: "Lamination" }],
  declarable: true,
};

const MERCH: CatalogCategory = {
  code: "corporate_event_merch",
  name: "Corporate & Event Merchandise",
  bestFor: "Student orgs and HR teams.",
  covers: [{ code: "drinkware", name: "Drinkware", examples: "Mugs" }],
  materials: [],
  finishes: [],
  declarable: true,
};

function catalog(aliases: Record<string, string> = {}): ServiceCatalog {
  return {
    categories: [MARKETING, MERCH],
    source: "platform",
    canDeclare: true,
    aliases,
  };
}

function line(
  id: string,
  categoryCode: string,
  state: string,
  extra: Partial<SupplierService> = {},
): SupplierService {
  return {
    id,
    supplierId: "user_supplier",
    categoryCode,
    materialCodes: [],
    finishCodes: [],
    productFamilyIds: [],
    sizeMin: null,
    sizeMax: null,
    qtyMin: null,
    qtyMax: null,
    pricingBasis: "per_unit",
    referenceRateMinor: 0,
    turnaroundHours: 48,
    capacityDaily: null,
    capacityWeekly: null,
    zones: [],
    equipmentNotes: "",
    state,
    verifiedAt: null,
    suspendedAt: null,
    suspendReason: null,
    withdrawnAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...extra,
  };
}

describe("serviceLifecycle", () => {
  it("maps every platform state to a word a shop would use", () => {
    expect(serviceLifecycle("draft")).toBe("draft");
    expect(serviceLifecycle("pending_verification")).toBe("submitted");
    expect(serviceLifecycle("live")).toBe("verified");
    expect(serviceLifecycle("suspended")).toBe("suspended");
    expect(serviceLifecycle("withdrawn")).toBe("removed");
    expect(serviceLifecycle("something_new")).toBe("other");
  });

  it("never puts a platform state string on screen", () => {
    for (const state of [
      "draft",
      "pending_verification",
      "live",
      "suspended",
      "withdrawn",
      "brand_new_state",
    ]) {
      const shown = presentLifecycle(serviceLifecycle(state));
      expect(shown.label).not.toContain("_");
      expect(shown.detail).not.toContain("_");
      expect(presentServiceState(state)).toBe(shown.label);
    }
  });
});

describe("declarationsFor", () => {
  it("pairs each category with the line behind it", () => {
    const declarations = declarationsFor(catalog(), [
      line("svc_1", "marketing_collateral", "live"),
    ]);

    expect(declarations.map((d) => d.offered)).toEqual([true, false]);
    expect(declarations[0].lifecycle).toBe("verified");
    expect(declarations[1].line).toBeNull();
  });

  it("treats a removed line as not offered, but remembers it", () => {
    const declarations = declarationsFor(catalog(), [
      line("svc_1", "marketing_collateral", "withdrawn"),
    ]);

    expect(declarations[0].offered).toBe(false);
    expect(declarations[0].lifecycle).toBe("removed");
    expect(declarations[0].line?.id).toBe("svc_1");
  });

  it("resolves a retired code so accredited work does not vanish", () => {
    // A line stored before the catalogue was published still says "offset".
    const declarations = declarationsFor(
      catalog({ offset: "marketing_collateral", large_format: "marketing_collateral" }),
      [line("svc_legacy", "offset", "live")],
    );

    expect(declarations[0].offered).toBe(true);
    expect(declarations[0].line?.id).toBe("svc_legacy");
  });

  it("prefers an active line over a removed one for the same category", () => {
    const declarations = declarationsFor(catalog(), [
      line("svc_old", "marketing_collateral", "withdrawn", {
        updatedAt: "2026-08-09T00:00:00.000Z",
      }),
      line("svc_new", "marketing_collateral", "draft", {
        updatedAt: "2026-08-02T00:00:00.000Z",
      }),
    ]);

    expect(declarations[0].line?.id).toBe("svc_new");
    expect(declarations[0].offered).toBe(true);
  });

  it("returns an empty declaration for a category with no line", () => {
    const declaration = declarationFor(catalog(), MERCH, []);

    expect(declaration).toEqual({
      category: MERCH,
      line: null,
      lifecycle: null,
      offered: false,
    });
  });
});

describe("catalogTotals", () => {
  it("counts offered categories and the work they cover", () => {
    const totals = catalogTotals(catalog(), [
      line("svc_1", "marketing_collateral", "live"),
      line("svc_2", "corporate_event_merch", "draft"),
    ]);

    expect(totals).toEqual({
      offered: 2,
      total: 2,
      drafts: 1,
      submitted: 0,
      verified: 1,
      suspended: 0,
      covered: 3,
      coverable: 3,
    });
  });

  it("counts nothing offered when every line is removed", () => {
    const totals = catalogTotals(catalog(), [
      line("svc_1", "marketing_collateral", "withdrawn"),
    ]);

    expect(totals.offered).toBe(0);
    expect(totals.covered).toBe(0);
    expect(totals.coverable).toBe(3);
  });
});

describe("submittableLineIds", () => {
  it("offers drafts and suspended lines, and nothing already verified", () => {
    const lines = [
      line("svc_1", "marketing_collateral", "draft"),
      line("svc_2", "corporate_event_merch", "live"),
    ];
    expect(submittableLineIds(catalog(), lines)).toEqual(["svc_1"]);

    const suspended = [line("svc_3", "marketing_collateral", "suspended")];
    expect(submittableLineIds(catalog(), suspended)).toEqual(["svc_3"]);
  });

  it("never offers a removed line", () => {
    expect(
      submittableLineIds(catalog(), [line("svc_1", "marketing_collateral", "withdrawn")]),
    ).toEqual([]);
  });
});

describe("capability refinement", () => {
  it("starts from what the line already holds", () => {
    const saved = line("svc_1", "marketing_collateral", "live", {
      materialCodes: ["matte_150gsm"],
      finishCodes: ["lamination"],
    });

    expect(capabilityDraftFor(saved)).toEqual({
      materialCodes: ["matte_150gsm"],
      finishCodes: ["lamination"],
    });
    expect(capabilityDraftFor(null)).toEqual({ materialCodes: [], finishCodes: [] });
  });

  it("ignores the order codes happen to be in", () => {
    const saved = line("svc_1", "marketing_collateral", "live", {
      materialCodes: ["matte_150gsm", "gloss_cardstock"],
    });

    expect(
      capabilityChanged(saved, {
        materialCodes: ["gloss_cardstock", "matte_150gsm"],
        finishCodes: [],
      }),
    ).toBe(false);
    expect(
      capabilityChanged(saved, { materialCodes: ["matte_150gsm"], finishCodes: [] }),
    ).toBe(true);
  });

  it("only calls it widening when a material is added, not dropped", () => {
    const saved = line("svc_1", "marketing_collateral", "live", {
      materialCodes: ["matte_150gsm"],
    });

    expect(
      expandsCapability(saved, {
        materialCodes: ["matte_150gsm", "gloss_cardstock"],
        finishCodes: [],
      }),
    ).toBe(true);
    expect(expandsCapability(saved, { materialCodes: [], finishCodes: [] })).toBe(false);
    // Nothing to widen when there is no line yet.
    expect(
      expandsCapability(null, { materialCodes: ["matte_150gsm"], finishCodes: [] }),
    ).toBe(false);
  });

  it("toggles a code in and out", () => {
    expect(toggleCode([], "a")).toEqual(["a"]);
    expect(toggleCode(["a", "b"], "a")).toEqual(["b"]);
  });
});
