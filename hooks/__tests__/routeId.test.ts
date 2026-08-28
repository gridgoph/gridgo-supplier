jest.mock("expo-router", () => ({ useFocusEffect: () => undefined }));

import { routeId } from "@/hooks/useBoard";

/**
 * The captain's report: "This listing is not reachable" on a listing GRIDGO
 * answers 200 for.
 *
 * `useLocalSearchParams` hands back `string | string[] | undefined`, and on the
 * first render of a pushed screen it is briefly undefined. Spending a request
 * on that asks GRIDGO for `/me/catalog-items/undefined`, gets a 404, and
 * reports the whole board as closed — a platform failure invented by a render
 * order. Nothing is fetched until the parameter is worth a request.
 */
describe("the listing id a screen was opened with", () => {
  it("takes the first of a repeated parameter", () => {
    expect(routeId(["sci_1", "sci_2"])).toBe("sci_1");
  });

  it("passes an ordinary id through untouched", () => {
    expect(routeId("sci_1")).toBe("sci_1");
  });

  it("trims what the router hands over", () => {
    expect(routeId(" sci_1 ")).toBe("sci_1");
  });

  it.each([
    ["nothing at all", undefined],
    ["an empty parameter", ""],
    ["whitespace", "   "],
    ["an empty repeat", []],
    // A route built by interpolating a value that was not there yet.
    ["the word undefined", "undefined"],
    ["the word null", "null"],
  ])("spends no request on %s", (_case, value) => {
    expect(routeId(value as string | string[] | undefined)).toBeNull();
  });
});
