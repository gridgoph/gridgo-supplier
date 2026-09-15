import { actionsForJob, findAction, JOB_JOURNEY, journeyIndex, routeForAction } from "@/lib/jobState";
import * as handoff from "@/lib/handoff";
import { custodyForOrder } from "@/lib/handoff";
import { JOB_STAGE_TICKETS, jobMatchesStage } from "@/lib/jobBoard";
import { milestoneDefinition } from "@/lib/milestones";

describe("packaging to joint pickup checks", () => {
  it.each(["production", "supplier_self_qc"])("dispatches a %s job without supplier quality signoff", (state) => {
    const order = { state, payoutMilestones: [], payoutHold: false };
    const action = findAction(order, "ready_for_pickup");
    expect(action?.targetState).toBe("ready_for_dispatch");
    expect(action?.label).toBe("Package for pickup");
    expect(routeForAction(action!.kind)).toBe("/job/[id]/handoff");
    expect(actionsForJob(order).some((step) => step.targetState === "supplier_self_qc")).toBe(false);
  });
  it("has no shop-side readiness checklist; the rider and shop check together at the counter", () => {
    expect(Object.keys(handoff).some((name) => /check/i.test(name))).toBe(false);
    expect(custodyForOrder({ state: "production", riderId: null }).detail).toMatch(/rider.*counter/);
  });
  it("keeps legacy jobs on the production floor without a self-QC stage", () => {
    expect(journeyIndex("supplier_self_qc")).toBe(journeyIndex("production"));
    expect(JOB_JOURNEY.map((step) => step.label)).not.toContain("Self-QC");
    expect(JOB_STAGE_TICKETS.map((step) => step.label)).not.toContain("Self-QC");
    expect(jobMatchesStage({ state: "supplier_self_qc", deadline: null, promisedDate: null }, "on_press")).toBe(true);
  });
  it("keeps package proof distinct from joint pickup quality checks", () => {
    expect(milestoneDefinition("packaging_qc")).toMatchObject({ label: "Packaging", proofOwner: "shop" });
    expect(custodyForOrder({ state: "rider_assigned", riderId: "rider" }).detail).toMatch(/together/);
    expect(custodyForOrder({ state: "ready_for_dispatch", riderId: null }).nextActor).toBe("Rider");
  });
});
