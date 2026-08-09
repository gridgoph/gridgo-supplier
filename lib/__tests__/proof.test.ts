import type { Order } from "@/lib/api";
import { lastChangeRequest } from "@/lib/proof";

type Entry = Order["timeline"][number];

function timeline(...entries: Partial<Entry>[]): Pick<Order, "timeline" | "proofFileIds"> {
  return {
    timeline: entries.map((e, i) => ({
      at: `2026-08-0${i + 1}T00:00:00.000Z`,
      state: "production",
      by: "user_supplier",
      note: "",
      ...e,
    })),
    proofFileIds: [],
  };
}

describe("lastChangeRequest", () => {
  it("returns the client's most recent reason", () => {
    const order = timeline(
      { state: "supplier_proof_changes_requested", by: "user_client", note: "Fix the crop marks." },
      { state: "supplier_proof_review", by: "user_supplier", note: "Corrected proof" },
      { state: "supplier_proof_changes_requested", by: "user_client", note: "Logo is too small." },
    );
    expect(lastChangeRequest(order)).toBe("Logo is too small.");
  });

  it("returns null rather than an empty string when no reason was given", () => {
    expect(
      lastChangeRequest(
        timeline({ state: "supplier_proof_changes_requested", by: "user_client", note: "   " }),
      ),
    ).toBeNull();
  });

  it("returns null when no changes were ever requested", () => {
    expect(lastChangeRequest(timeline({ state: "supplier_proof_review" }))).toBeNull();
  });
});
