import { orderReference, orderReferenceSpoken } from "@/lib/orderReference";

describe("orderReference", () => {
  it("turns the platform key into a reference a person can read out", () => {
    expect(orderReference("ord_3ff0128e105a")).toBe("3FF0-128E-105A");
  });

  it("keeps the whole identity, so what is quoted is what Operations searches by", () => {
    expect(orderReference("ord_3ff0128e105a")?.replace(/-/g, "").toLowerCase()).toBe(
      "3ff0128e105a",
    );
  });

  it("leaves a non-hex id readable rather than mangling it", () => {
    expect(orderReference("ord_demo_1")).toBe("DEMO_1");
    expect(orderReference("ORD-abc")).toBe("ABC");
  });

  it("has nothing to say without an id", () => {
    expect(orderReference(undefined)).toBeNull();
    expect(orderReference("")).toBeNull();
    expect(orderReference("ord_")).toBeNull();
  });

  it("is spoken as groups of characters, not as one word", () => {
    expect(orderReferenceSpoken("ord_3ff0128e105a")).toBe("Order reference 3FF0 128E 105A");
    expect(orderReferenceSpoken(null)).toBeNull();
  });
});
