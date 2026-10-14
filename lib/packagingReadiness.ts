import type { Order } from "@/lib/api";
import { readRequirements, type Requirement, type RequirementKind } from "@/lib/apiErrors";

/**
 * What still stands between a job and "Ready for dispatch", as GRIDGO counts
 * it (gridgo-api `docs/SUPPLIER_JOB_READINESS_API.md`, report 6C695C15).
 *
 * Shops pressed the packaging step and were told only that GRIDGO would not
 * take it. GRIDGO now sends, on every read of the job, everything it would
 * refuse the step for — both photos, an open claim, a stopped job — each with
 * its own sentence. This module is the only place that reads it, so the list
 * a shop sees before pressing is the list GRIDGO checks after.
 *
 * It is a snapshot, not a promise: the step is checked again when pressed, and
 * a refusal then is shown in GRIDGO's words too (`stepRefusal`). A job read
 * from an older GRIDGO has no list, and the screens keep their older photo
 * gates. A receipt scan is optional and never in the list; it is said as such.
 */

export type PackagingCheck = {
  /** GRIDGO would take "Ready for dispatch" as of this read. */
  allowed: boolean;
  /** Still needed, in GRIDGO's order, each in its own sentence. */
  missing: Requirement[];
  /** The two photos ticked off or not, so a shop sees what is already done as well as what is not. */
  photos: { kind: Extract<RequirementKind, "production_photo" | "packing_photo">; done: boolean }[];
  /** True once a receipt scan is on the job. It never holds the step. */
  receiptAttached: boolean;
};

type ReadinessOrder = Pick<Order, "state" | "transitionReadiness">;

export function packagingCheck(order: ReadinessOrder): PackagingCheck | null {
  if (order.state !== "production" && order.state !== "supplier_self_qc") return null;
  const raw = order.transitionReadiness?.ready_for_dispatch;
  if (!raw || typeof raw !== "object") return null;
  const missing = readRequirements(raw.missing);
  const owes = (kind: RequirementKind) => missing.some((item) => item.kind === kind);
  return {
    allowed: raw.allowed === true && missing.length === 0,
    missing,
    photos: [
      { kind: "production_photo", done: !owes("production_photo") },
      { kind: "packing_photo", done: !owes("packing_photo") },
    ],
    receiptAttached: raw.receiptScan?.attached === true,
  };
}

/**
 * Something on the list the shop cannot do itself — a claim only Operations
 * can clear, a job a refund or a deadline request has stopped, a job that has
 * already moved on. Packaging is not offered while one stands, because GRIDGO
 * would only refuse it.
 */
export function packagingHeld(check: PackagingCheck | null): boolean {
  return Boolean(check?.missing.some((item) => !isPhoto(item.kind)));
}

function isPhoto(kind: RequirementKind): boolean {
  return kind === "production_photo" || kind === "packing_photo";
}

/** The requirements that are not photos, which the checklist lists after the photo rows. */
export function otherRequirements(check: PackagingCheck): Requirement[] {
  return check.missing.filter((item) => !isPhoto(item.kind));
}

/** The sentence GRIDGO gave for a photo it still needs, if it needs it. */
export function photoRequirement(check: PackagingCheck, kind: RequirementKind): Requirement | null {
  return check.missing.find((item) => item.kind === kind) ?? null;
}

/** A row's name, in the shop's words. */
export function requirementTitle(kind: RequirementKind): string {
  switch (kind) {
    case "production_photo":
      return "Production photo";
    case "packing_photo":
      return "Packing photo";
    case "claim":
      return "Client claim open";
    case "job_stopped":
      return "Job paused";
    case "moved_on":
      return "Job has moved on";
    default:
      return "Something else first";
  }
}
