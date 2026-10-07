import type { ProductionItem } from "@/lib/api";
import { orderProductionItems, productionSpecRows } from "@/lib/productionSpecs";
const item: ProductionItem = { id: "line1", itemName: "Banner", quantity: 2, pricingUnit: "per_sqft", packageQty: null, measurement: { widthMilli: 2500, heightMilli: 4000, unit: "ft" }, structuredSpec: { material: "mesh_banner", finish: "hem_grommet", priceMinor: 20000 }, options: [{ groupName: "Print sides", label: "Both sides" }], artworkFileId: "file1", mockupFileId: null };
it("shows quantity, all measured dimensions, readable spec and selected options without money", () => {
  const rows = productionSpecRows(item);
  expect(rows).toEqual(expect.arrayContaining([{ label: "Width", value: "2.5 ft" }, { label: "Height", value: "4 ft" }, { label: "Material", value: "mesh banner" }, { label: "Print sides", value: "Both sides" }]));
  expect(JSON.stringify(rows)).not.toContain("20000");
});
it("does not infer millimetres from thousandths when old data has no unit", () => expect(productionSpecRows({ ...item, measurement: { widthMilli: 2500 } })).toContainEqual({ label: "Width", value: "2.5 (unit not recorded)" }));
it("preserves every item instead of flattening a multi-item job into its first line", () => {
  const order = { id: "order1", title: "Job", quantity: 3, size: "", material: "", productionItems: [item, { ...item, id: "line2" }] };
  expect(orderProductionItems(order).map((line) => line.id)).toEqual(["line1", "line2"]);
});
it("retains readable summary specs for legacy orders", () => {
  const items = orderProductionItems({ id: "old", title: "Legacy print", quantity: 5, size: "A4", material: "paper", finish: "matte" });
  expect(productionSpecRows(items[0])).toContainEqual({ label: "Size", value: "A4" });
});

it("shows which document pages to print and how many belong to each copy", () => {
  const rows = productionSpecRows({ ...item, pricingUnit: "per_page", quantity: 3,
    measurement: { pages: 5 }, documentPages: { total: 30, range: "1-4, 8", printed: 5 } });
  expect(rows).toEqual(expect.arrayContaining([
    { label: "Quantity", value: "3" }, { label: "File pages", value: "30" },
    { label: "Pages to print", value: "1-4, 8" }, { label: "Pages per copy", value: "5" },
  ]));
  expect(rows.some(row => row.label === "Pages")).toBe(false);
});
it("labels all-page selections and preserves older page-only orders", () => {
  expect(productionSpecRows({ ...item, documentPages: { total: 10, range: null, printed: 10 } }))
    .toContainEqual({ label: "Pages to print", value: "All pages" });
  expect(productionSpecRows({ ...item, measurement: { pages: 4 } })).toContainEqual({ label: "Pages", value: "4" });
});
