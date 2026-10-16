import { View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { layoutDiagram, type PrintLayoutCode, type Rect } from "@/lib/printLayout";

type Props = {
  layout: PrintLayoutCode;
  /** Any unit, as long as paper and page share it. */
  paper: { width: number; height: number };
  page: { width: number; height: number };
  width: number;
  height: number;
};

/**
 * The paper with the client's page placed on it the way the layout prints it.
 *
 * The paper is the solid frame; the page is the dashed outline. What the page
 * prints onto is shaded, and what hangs past the paper is tinted in the
 * warning colour — that is the part that will be cut off. Under fit to paper
 * a faint dotted outline keeps the page's actual size, so the scaling shows.
 * Decorative: the words beside it carry every fact, so it is hidden from
 * screen readers.
 */
export function PrintLayoutDiagram({ layout, paper, page, width, height }: Props) {
  const colors = useThemeColors();
  const shape = layoutDiagram(layout, paper, page, { width, height });
  const printed = intersect(shape.page, shape.paper);
  const overhangs =
    shape.page.x < shape.paper.x - 0.5 ||
    shape.page.y < shape.paper.y - 0.5 ||
    shape.page.x + shape.page.width > shape.paper.x + shape.paper.width + 0.5 ||
    shape.page.y + shape.page.height > shape.paper.y + shape.paper.height + 0.5;

  return (
    <View
      style={{ width, height }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {overhangs ? (
        <View style={[place(shape.page), { backgroundColor: colors.warning, opacity: 0.22 }]} />
      ) : null}
      <View
        style={[
          place(shape.paper),
          { backgroundColor: colors.surface, borderColor: colors.textMuted, borderWidth: 1, borderRadius: 2 },
        ]}
      />
      {printed ? (
        <View style={[place(printed), { backgroundColor: colors.textPrimary, opacity: 0.14 }]} />
      ) : null}
      {shape.original ? (
        <View
          style={[
            place(shape.original),
            { borderColor: colors.textMuted, borderWidth: 1, borderStyle: "dotted" },
          ]}
        />
      ) : null}
      <View
        style={[
          place(shape.page),
          {
            borderColor: overhangs ? colors.warning : colors.textPrimary,
            borderWidth: 1.5,
            borderStyle: "dashed",
          },
        ]}
      />
    </View>
  );
}

function place(rect: Rect) {
  return { position: "absolute" as const, left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}

function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}
