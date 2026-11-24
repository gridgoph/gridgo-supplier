import { bundleHint, bundleLine, expressBundles, expressView, groupTagLabel, itemMemberName } from "@/lib/expressOrder";
import type { Order } from "@/lib/api";

const print = (fileId: string, printed: number, copies: number, member?: { id: string; name: string }) => ({
  fileId,
  pages: { total: printed, range: null, printed },
  copies,
  colour: "bw",
  paper: "a4",
  sides: "one",
  layout: "fit_to_paper",
  note: "",
  ...(member ? { groupMemberId: member.id, groupMemberName: member.name } : {}),
});

const ana = { id: "user_a", name: "Member A" };
const ben = { id: "user_b", name: "Member B" };

function order(printSettings: unknown[], extra: Record<string, unknown> = {}): Order {
  return {
    id: "ord_group",
    title: "Express documents",
    state: "payment_authorized",
    orderType: "express",
    fulfillmentMode: "pickup",
    expressOrder: { status: "accepted", printSettings },
    groupOrder: { id: "grp_1", memberCount: 3, hostName: "Host H" },
    ...extra,
  } as unknown as Order;
}

describe("group orders", () => {
  it("reads the group and each file's person", () => {
    const view = expressView(order([print("f1", 2, 1, ana)]))!;
    expect(view.group).toEqual({ memberCount: 3, hostName: "Host H" });
    expect(view.prints[0].member).toEqual(ana);
  });

  it("says nothing about groups on an ordinary order", () => {
    const view = expressView(order([print("f1", 2, 1)], { groupOrder: undefined }))!;
    expect(view.group).toBeNull();
    expect(view.prints[0].member).toBeNull();
    expect(expressBundles(view)).toBeNull();
  });

  it("splits the prints into one bundle per person, in GRIDGO's order", () => {
    const view = expressView(order([print("f1", 2, 1, ana), print("f2", 3, 2, ben), print("f3", 4, 1, ana)]))!;
    const bundles = expressBundles(view)!;
    expect(bundles.map((b) => b.member.name)).toEqual(["Member A", "Member B"]);
    expect(bundles[0].prints.map((p) => p.fileId)).toEqual(["f1", "f3"]);
    expect(bundles[0].totalPages).toBe(6);
    expect(bundles[1].totalPages).toBe(6);
    expect(bundleLine(bundles[0])).toBe("2 files · 6 pages");
  });

  it("keeps one plain list when any file has no person, so nothing lands in the wrong bundle", () => {
    const view = expressView(order([print("f1", 2, 1, ana), print("f2", 3, 1)]))!;
    expect(expressBundles(view)).toBeNull();
  });

  it("names the group tag from GRIDGO's count", () => {
    expect(groupTagLabel({ memberCount: 4, hostName: null })).toBe("Group order, 4 people");
    expect(groupTagLabel({ memberCount: 1, hostName: null })).toBe("Group order, 1 person");
    expect(groupTagLabel({ memberCount: null, hostName: null })).toBe("Group order");
  });

  it("says who ends up with every bundle", () => {
    const pickup = expressView(order([print("f1", 2, 1, ana)]))!;
    expect(bundleHint(pickup)).toBe("Write each name on its bundle. Host H, the host, collects them all.");
    const delivery = expressView(
      order([print("f1", 2, 1, ana)], { fulfillmentMode: "delivery", groupOrder: { id: "grp_1", memberCount: 2 } }),
    )!;
    expect(bundleHint(delivery)).toBe("Write each name on its bundle. The rider takes them all to the host.");
  });

  it("names the person a production line is packed for, and nobody on an ordinary line", () => {
    expect(itemMemberName({ groupMember: { id: "user_b", name: " Member B " } })).toBe("Member B");
    expect(itemMemberName({ groupMember: { id: "user_b" } })).toBeNull();
    expect(itemMemberName({})).toBeNull();
  });
});
