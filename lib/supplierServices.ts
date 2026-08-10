import type { StatusIconName, StatusTone } from "@/components/StatusChip";
import type { SupplierService } from "@/lib/api";
import { resolveCategoryCode, type CatalogCategory, type ServiceCatalog } from "@/lib/taxonomy";

/**
 * What a shop offers, and how far each declaration has got.
 *
 * GRIDGO accredits a **category**: a supplier service line holds one
 * `categoryCode`, so that is the unit a shop offers, Operations verifies, and
 * matching routes work against. The subcategories inside a category are what it
 * covers — they say what saying yes commits the shop to, and the refinement
 * that actually changes the work GRIDGO sends is the materials and finishes on
 * the line itself.
 *
 * A declaration starts as a draft, is submitted for verification, and becomes
 * verified when Operations approves it. Operations can suspend one; the shop can
 * remove one. This module owns that vocabulary — the same words appear on every
 * screen, and no platform state string reaches one.
 */

export type ServiceLifecycle =
  | "draft"
  | "submitted"
  | "verified"
  | "suspended"
  | "removed"
  /** Declared, but in a state this app has no word for yet. */
  | "other";

export function serviceLifecycle(state: string): ServiceLifecycle {
  switch (state) {
    case "draft":
      return "draft";
    case "pending_verification":
      return "submitted";
    case "live":
      return "verified";
    case "suspended":
      return "suspended";
    case "withdrawn":
      return "removed";
    default:
      return "other";
  }
}

export type LifecyclePresentation = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  /** Whose move it is, in one sentence. */
  detail: string;
};

export function presentLifecycle(lifecycle: ServiceLifecycle): LifecyclePresentation {
  switch (lifecycle) {
    case "draft":
      return {
        label: "Draft",
        tone: "neutral",
        icon: "square-pen",
        detail: "Not sent yet. Submit it and Operations will check your shop can produce it.",
      };
    case "submitted":
      return {
        label: "Submitted",
        tone: "info",
        icon: "clock",
        detail: "With Operations. They verify it before GRIDGO sends you this work.",
      };
    case "verified":
      return {
        label: "Verified",
        tone: "success",
        icon: "circle-check",
        detail: "GRIDGO matches this work to your shop.",
      };
    case "suspended":
      return {
        label: "Suspended",
        tone: "error",
        icon: "triangle-alert",
        detail: "Operations paused this one. Submit it again once the reason is settled.",
      };
    case "removed":
      return {
        label: "Removed",
        tone: "neutral",
        icon: "circle-x",
        detail: "Off your shop. Offer it again to send it back for verification.",
      };
    default:
      return {
        label: "In review",
        tone: "neutral",
        icon: "clock",
        detail: "Operations is working on this one.",
      };
  }
}

/** Plain label for a service line's accreditation state. */
export function presentServiceState(state: string): string {
  return presentLifecycle(serviceLifecycle(state)).label;
}

/** A line the shop currently offers work through. */
export function isActiveLine(service: Pick<SupplierService, "state">): boolean {
  return service.state !== "withdrawn";
}

export type CategoryDeclaration = {
  category: CatalogCategory;
  /** The accreditation line behind this category, if the shop has one. */
  line: SupplierService | null;
  lifecycle: ServiceLifecycle | null;
  offered: boolean;
};

/**
 * The line behind each category.
 *
 * A line stored before the catalogue was published still holds a retired code,
 * so every `categoryCode` is resolved through the platform's aliases first —
 * otherwise a shop's accredited work would vanish from this screen.
 */
function linesByCategory(
  catalog: ServiceCatalog,
  services: SupplierService[],
): Map<string, SupplierService> {
  const map = new Map<string, SupplierService>();
  for (const line of services) {
    const code = resolveCategoryCode(catalog, line.categoryCode);
    const existing = map.get(code);
    if (!existing) {
      map.set(code, line);
      continue;
    }
    // An active line always wins over a removed one; otherwise the newest.
    if (isActiveLine(line) && !isActiveLine(existing)) {
      map.set(code, line);
      continue;
    }
    if (isActiveLine(line) === isActiveLine(existing) && line.updatedAt > existing.updatedAt) {
      map.set(code, line);
    }
  }
  return map;
}

export function declarationsFor(
  catalog: ServiceCatalog,
  services: SupplierService[],
): CategoryDeclaration[] {
  const byCategory = linesByCategory(catalog, services);
  return catalog.categories.map((category) => {
    const line = byCategory.get(category.code) ?? null;
    return {
      category,
      line,
      lifecycle: line ? serviceLifecycle(line.state) : null,
      offered: line != null && isActiveLine(line),
    };
  });
}

export function declarationFor(
  catalog: ServiceCatalog,
  category: CatalogCategory,
  services: SupplierService[],
): CategoryDeclaration {
  return (
    declarationsFor(catalog, services).find((d) => d.category.code === category.code) ?? {
      category,
      line: null,
      lifecycle: null,
      offered: false,
    }
  );
}

export type CatalogTotals = {
  /** Categories the shop offers. */
  offered: number;
  total: number;
  drafts: number;
  submitted: number;
  verified: number;
  suspended: number;
  /** Subcategories covered by everything the shop offers. */
  covered: number;
  coverable: number;
};

export function catalogTotals(
  catalog: ServiceCatalog,
  services: SupplierService[],
): CatalogTotals {
  const totals: CatalogTotals = {
    offered: 0,
    total: catalog.categories.length,
    drafts: 0,
    submitted: 0,
    verified: 0,
    suspended: 0,
    covered: 0,
    coverable: 0,
  };
  for (const declaration of declarationsFor(catalog, services)) {
    totals.coverable += declaration.category.covers.length;
    if (!declaration.offered) continue;
    totals.offered += 1;
    totals.covered += declaration.category.covers.length;
    if (declaration.lifecycle === "verified") totals.verified += 1;
    if (declaration.lifecycle === "submitted") totals.submitted += 1;
    if (declaration.lifecycle === "draft") totals.drafts += 1;
    if (declaration.lifecycle === "suspended") totals.suspended += 1;
  }
  return totals;
}

/** Lines Operations has not looked at yet — what "Submit" would send. */
export function submittableLineIds(
  catalog: ServiceCatalog,
  services: SupplierService[],
): string[] {
  const ids: string[] = [];
  for (const declaration of declarationsFor(catalog, services)) {
    if (!declaration.offered || !declaration.line) continue;
    if (declaration.lifecycle !== "draft" && declaration.lifecycle !== "suspended") continue;
    if (!ids.includes(declaration.line.id)) ids.push(declaration.line.id);
  }
  return ids;
}

/**
 * The materials and finishes a shop can handle inside one category.
 *
 * This is the refinement that changes the work GRIDGO sends: matching checks a
 * job's material against the line's, so a shop that prints on tarpaulin but not
 * mesh should say so rather than declining the jobs afterwards.
 */
export type CapabilityDraft = {
  materialCodes: string[];
  finishCodes: string[];
};

export function capabilityDraftFor(line: SupplierService | null): CapabilityDraft {
  return {
    materialCodes: [...(line?.materialCodes ?? [])],
    finishCodes: [...(line?.finishCodes ?? [])],
  };
}

function sameCodes(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((code, index) => code === right[index]);
}

export function capabilityChanged(
  line: SupplierService | null,
  draft: CapabilityDraft,
): boolean {
  const saved = capabilityDraftFor(line);
  return (
    !sameCodes(saved.materialCodes, draft.materialCodes) ||
    !sameCodes(saved.finishCodes, draft.finishCodes)
  );
}

/**
 * True when the draft claims something the line was not verified for.
 *
 * GRIDGO sends a verified line back to Operations when a shop widens what it
 * can take on, so the screen has to say that before the shop saves — finding out
 * afterwards, from a status that quietly changed, is how trust in a status goes.
 */
export function expandsCapability(
  line: SupplierService | null,
  draft: CapabilityDraft,
): boolean {
  if (!line) return false;
  const saved = capabilityDraftFor(line);
  return draft.materialCodes.some((code) => !saved.materialCodes.includes(code));
}

export function toggleCode(codes: string[], code: string): string[] {
  return codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];
}
