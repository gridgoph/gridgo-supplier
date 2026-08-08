import { illustrations, type IllustrationName } from "@/components/illustrations";

const NAMES: IllustrationName[] = ["storefront", "working", "packages"];

describe("illustration registry", () => {
  it("registers exactly the three supplier pieces", () => {
    expect(Object.keys(illustrations).sort()).toEqual([...NAMES].sort());
  });

  it("exports a component and a positive aspect for each piece", () => {
    for (const name of NAMES) {
      const entry = illustrations[name];
      expect(typeof entry.Component).toBe("function");
      expect(entry.aspect).toBeGreaterThan(0.5);
      expect(entry.aspect).toBeLessThan(3);
    }
  });
});
