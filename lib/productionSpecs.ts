import type { Order, ProductionItem } from "@/lib/api";

export type SpecValue = { label: string; value: string };
export function readableSpec(value: string): string {
  return value.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
}

/** Production values only. Money and evidence never become specification rows. */
export function productionSpecRows(item: ProductionItem): SpecValue[] {
  const rows: SpecValue[] = [{ label: "Quantity", value: String(item.quantity) }];
  if (item.pricingUnit) rows.push({ label: "Unit", value: readableSpec(item.pricingUnit) });
  if (item.packageQty) rows.push({ label: "Pack size", value: String(item.packageQty) });
  const measurement = item.measurement;
  if (measurement) {
    if (measurement.pages != null) rows.push({ label: "Pages", value: String(measurement.pages) });
    for (const [key, label] of [["widthMilli", "Width"], ["heightMilli", "Height"], ["lengthMilli", "Length"]] as const) {
      const value = measurement[key];
      if (value != null) rows.push({ label, value: `${value / 1000}${measurement.unit ? ` ${measurement.unit}` : " (unit not recorded)"}` });
    }
  }
  for (const [key, value] of Object.entries(item.structuredSpec ?? {})) {
    if (/price|cost|amount|payment|commission|settlement|receipt|file|token|secret/i.test(key)) continue;
    const text = typeof value === "string" ? readableSpec(value) : typeof value === "number" ? String(value) : typeof value === "boolean" ? (value ? "Yes" : "No") : null;
    if (!text) continue;
    const label = readableSpec(key);
    rows.push({ label: label.charAt(0).toUpperCase() + label.slice(1), value: text });
  }
  for (const option of item.options ?? []) {
    if (option.label) rows.push({ label: option.groupName || "Selected option", value: option.label });
  }
  return rows;
}

export function orderProductionItems(order: Pick<Order, "id" | "title" | "quantity" | "size" | "material" | "finish" | "productionItems">): ProductionItem[] {
  if (order.productionItems?.length) return order.productionItems;
  return [{ id: order.id, itemName: order.title, quantity: order.quantity, pricingUnit: null, packageQty: null, measurement: null,
    structuredSpec: { size: order.size, material: order.material, finish: order.finish }, options: [], artworkFileId: null, mockupFileId: null }];
}
