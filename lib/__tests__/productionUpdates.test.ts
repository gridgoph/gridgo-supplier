import {
  PRODUCTION_UPDATE_TEMPLATES,
  templatesForAction,
} from "@/lib/productionUpdates";

describe("PRODUCTION_UPDATE_TEMPLATES", () => {
  it("keeps every client-facing note in plain language", () => {
    for (const template of PRODUCTION_UPDATE_TEMPLATES) {
      expect(template.timelineNote).not.toMatch(/_/);
      expect(template.label.length).toBeLessThanOrEqual(16);
    }
  });
});

describe("templatesForAction", () => {
  it("offers a real choice when production starts", () => {
    expect(templatesForAction("start_production").length).toBeGreaterThan(1);
  });

  it("has nothing to choose when sending for payment", () => {
    expect(templatesForAction("request_payment")).toHaveLength(1);
  });

  it("offers nothing for steps that have their own screen", () => {
    expect(templatesForAction("self_qc")).toEqual([]);
    expect(templatesForAction("decline")).toEqual([]);
    expect(templatesForAction(undefined)).toEqual([]);
  });
});
