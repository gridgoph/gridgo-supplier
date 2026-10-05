import { PUBLISHED_CATALOG } from "@/data/serviceCatalog";
import {
  IN_HOUSE_LISTING,
  IN_HOUSE_ONBOARDING,
  productNames,
  productsToggleLabel,
} from "@/lib/inHouse";
import { NO_SUBCONTRACTING_ACCEPT_LINE, NO_SUBCONTRACTING_TERM, supplierTerms } from "@/lib/supplierTerms";

function category(code: string) {
  const found = PUBLISHED_CATALOG.find((entry) => entry.code === code);
  if (!found) throw new Error(`no ${code}`);
  return found;
}

describe("what sits in each category", () => {
  it("names marketing collateral's products, flyers and business cards among them", () => {
    expect(productNames(category("marketing_collateral").services)).toBe(
      "Flyers, Brochures, Posters & standees, Business cards, Stickers & packaging labels, " +
        "Tarpaulins & outdoor banners",
    );
  });

  it("gives every published category at least one product with what it covers", () => {
    for (const entry of PUBLISHED_CATALOG) {
      expect(entry.services.length).toBeGreaterThan(0);
      for (const product of entry.services) {
        expect(product.name.trim()).not.toBe("");
        expect(product.examples.trim()).not.toBe("");
      }
    }
  });

  it("counts the products on the disclosure and says how to close it", () => {
    expect(productsToggleLabel(6, false)).toBe("What these 6 products cover");
    expect(productsToggleLabel(1, false)).toBe("What this product covers");
    expect(productsToggleLabel(6, true)).toBe("Hide the details");
  });
});

describe("the in-house instruction", () => {
  it("tells an applying shop to pick only what it makes, not every product", () => {
    expect(IN_HOUSE_ONBOARDING.title).toBe("Only what you make in your own shop");
    expect(IN_HOUSE_ONBOARDING.body).toMatch(/at least one of its products yourself/);
    expect(IN_HOUSE_ONBOARDING.body).toMatch(/don't have to offer everything in it/);
  });

  it("tells a shop adding a listing the same thing", () => {
    expect(IN_HOUSE_LISTING).toMatch(/only work you make in your own shop/);
    expect(IN_HOUSE_LISTING).toMatch(/don't need a listing for everything/);
  });
});

describe("the no-subcontracting term", () => {
  it("states the approved wording where the shop sends its application", () => {
    expect(NO_SUBCONTRACTING_TERM).toBe(
      "You make every order you accept in your own shop, with your own equipment. Decline any order you cannot make in-house, whether you lack the materials, the equipment or the skill, and never pass an accepted order to another shop.",
    );
    expect(supplierTerms()).toEqual([NO_SUBCONTRACTING_TERM]);
  });

  it("is one short line on the Accept screen", () => {
    expect(NO_SUBCONTRACTING_ACCEPT_LINE).toMatch(/your own shop, with your own equipment/);
    expect(NO_SUBCONTRACTING_ACCEPT_LINE).toMatch(/never pass it to another shop/);
    expect(NO_SUBCONTRACTING_ACCEPT_LINE).not.toMatch(/\n/);
  });

  it("is shown once there is approved text, and blank text never counts", () => {
    expect(supplierTerms(["Make it yourself.", null, "  "])).toEqual(["Make it yourself."]);
  });
});
