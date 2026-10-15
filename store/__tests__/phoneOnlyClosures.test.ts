import type { User } from "@/lib/api";
import { useSession } from "@/store/session";
import { useShopPlan } from "@/store/shopPlan";

const shop = (id: string) => ({ id, email: `${id}@gridgo.local`, name: "Shop", role: "supplier" as const }) as User;
const leftover = [{ id: "bo_1", startDay: "2026-11-02", endDay: "2026-11-02" }];

describe("closures an earlier version kept on this phone", () => {
  beforeEach(() => {
    useSession.setState({ user: null });
    useShopPlan.setState({ blackouts: leftover });
  });

  it("stay for the shop that signs in on this phone", () => {
    useSession.setState({ user: shop("u1") });
    expect(useShopPlan.getState().blackouts).toEqual(leftover);
  });

  it("are never offered to another shop", () => {
    useSession.setState({ user: shop("u1") });
    useSession.setState({ user: shop("u2") });
    expect(useShopPlan.getState().blackouts).toEqual([]);
  });

  it("leave with the shop when it signs out", () => {
    useSession.setState({ user: shop("u1") });
    useSession.setState({ user: null });
    expect(useShopPlan.getState().blackouts).toEqual([]);
  });
});
