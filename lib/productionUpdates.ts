import type { SupplierActionKind } from "@/lib/jobState";

/**
 * The shop's own vocabulary for a production update.
 *
 * GRIDGO stores one note per state change, and that note is what the client
 * reads on their order. Offering the shop a short fixed set means two shops
 * reporting the same thing say the same thing, while the free-text field beside
 * it still carries anything specific.
 */

export type ProductionTemplateId =
  | "queued"
  | "printing"
  | "on_track"
  | "materials_ready"
  | "finishing"
  | "sent_for_payment";

export type ProductionTemplate = {
  id: ProductionTemplateId;
  /** What the shop taps. Short enough for a segmented control. */
  label: string;
  /** What the client reads. */
  timelineNote: string;
};

export const PRODUCTION_UPDATE_TEMPLATES: readonly ProductionTemplate[] = [
  { id: "queued", label: "Queued", timelineNote: "Production started — job is queued on the press" },
  { id: "printing", label: "Printing", timelineNote: "Production started — printing now" },
  {
    id: "materials_ready",
    label: "Materials ready",
    timelineNote: "Production started — materials cut and staged",
  },
  { id: "on_track", label: "On track", timelineNote: "Production update — job is on track" },
  { id: "finishing", label: "Finishing", timelineNote: "Production update — finishing and trimming" },
  {
    id: "sent_for_payment",
    label: "Ready to invoice",
    timelineNote: "Sent to the client for payment",
  },
] as const;

/** The templates that make sense for a given step. */
export function templatesForAction(
  kind: SupplierActionKind | undefined,
): ProductionTemplate[] {
  if (kind === "start_production") {
    return PRODUCTION_UPDATE_TEMPLATES.filter((t) =>
      ["queued", "printing", "materials_ready"].includes(t.id),
    );
  }
  if (kind === "request_payment") {
    return PRODUCTION_UPDATE_TEMPLATES.filter((t) => t.id === "sent_for_payment");
  }
  return [];
}
