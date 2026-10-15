import type { User } from "@/lib/api";
import { useSession } from "@/store/session";
import { phoneOnlyClosuresFor, useShopPlan } from "@/store/shopPlan";

const shop = (id: string) => ({ id, email: `${id}@gridgo.local`, name: "Shop", role: "supplier" as const }) as User;
const leftover = [{ id: "bo_1", startDay: "2026-11-02", endDay: "2026-11-02" }];
const shownTo = (id: string) => phoneOnlyClosuresFor(useShopPlan.getState(), id);

describe("closures an earlier version kept on this phone", () => {
  beforeEach(() => {
    useSession.setState({ user: null });
    useShopPlan.setState({ blackouts: leftover, ownerId: null });
  });

  it("are claimed by the first shop that signs in, and shown to it", () => {
    useSession.setState({ user: shop("u1") });
    expect(useShopPlan.getState().ownerId).toBe("u1");
    expect(shownTo("u1")).toEqual(leftover);
    expect(shownTo("u2")).toEqual([]);
  });

  it("are never offered to another shop", () => {
    useSession.setState({ user: shop("u1") });
    useSession.setState({ user: shop("u2") });
    expect(useShopPlan.getState().blackouts).toEqual([]);
    expect(shownTo("u2")).toEqual([]);
  });

  it("leave with the shop when it signs out", () => {
    useSession.setState({ user: shop("u1") });
    useSession.setState({ user: null });
    expect(useShopPlan.getState().blackouts).toEqual([]);
  });

  it("claimed by one shop are deleted when another starts the app", () => {
    useShopPlan.setState({ blackouts: leftover, ownerId: "u1" });
    useSession.setState({ user: shop("u2") });
    expect(useShopPlan.getState().blackouts).toEqual([]);
  });
});
