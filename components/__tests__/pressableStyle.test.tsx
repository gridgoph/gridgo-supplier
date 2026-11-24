import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import ts from "typescript";

import { Pressable } from "@/components/Pressable";

/**
 * Issue report 8DC78D1F, as a rule.
 *
 * On a phone, NativeWind merges `className` and `style` into one array, and
 * React Native only calls `style` when it is a bare function, so a style
 * function next to a `className` is silently dropped. Jest and Expo web both
 * still apply it, which is why no rendering test can see the bug. So this
 * reads the sources instead: a pressable imported from `react-native` must not
 * carry both. Use `@/components/Pressable`, which resolves the function to a
 * plain object first.
 *
 * Only an inline arrow or function expression is recognised; a style function
 * held in a variable is not, so write it inline.
 */
const PRESSABLES = new Set([
  "Pressable",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "TouchableNativeFeedback",
]);

const root = join(__dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === "__tests__" ? [] : sourceFiles(path);
    return entry.endsWith(".tsx") ? [path] : [];
  });
}

/** Local names this file binds to one of React Native's pressables. */
function nativePressableNames(file: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if ((statement.moduleSpecifier as ts.StringLiteral).text !== "react-native") continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (PRESSABLES.has(imported)) names.add(element.name.text);
    }
  }
  return names;
}

/** `file:line` for every native pressable with both `className` and a style function. */
function pressableStyleOffenders(path: string, source: string): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = nativePressableNames(file);
  const offenders: string[] = [];

  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      names.has(node.tagName.getText(file))
    ) {
      let className = false;
      let styleFunction = false;
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) continue;
        const name = attribute.name.getText(file);
        if (name === "className") className = true;
        const value = attribute.initializer;
        if (name === "style" && value && ts.isJsxExpression(value) && value.expression) {
          styleFunction = ts.isArrowFunction(value.expression) || ts.isFunctionExpression(value.expression);
        }
      }
      if (className && styleFunction) {
        const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
        offenders.push(`${relative(root, path)}:${line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return offenders;
}

describe("pressable style contract", () => {
  const files = [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "components"))];

  it("reads the app's screens and components", () => {
    // A move that silently matched nothing would make the rule vacuous.
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((file) => file.endsWith("ProductTypeGrid.tsx"))).toBe(true);
  });

  it("recognises the shape that broke on phones", () => {
    const source = `import { Pressable as P } from "react-native";
      export const A = () => <P className="w-1" style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })} />;
      export const B = () => <P className="w-1" style={{ opacity: 1 }} />;
      export const C = () => <P style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })} />;`;
    expect(pressableStyleOffenders(join(root, "x.tsx"), source)).toEqual(["x.tsx:2"]);
  });

  it("never pairs className with a style function on a React Native pressable", () => {
    const offenders = files.flatMap((file) => pressableStyleOffenders(file, readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("hands the native pressable a plain style object that follows the press", async () => {
    await render(
      <Pressable
        testID="tile"
        className="rounded-card"
        style={({ pressed }) => ({ width: 144, opacity: pressed ? 0.7 : 1 })}
      />,
    );
    const tile = screen.getByTestId("tile");
    expect(StyleSheet.flatten(tile.props.style)).toEqual(expect.objectContaining({ width: 144, opacity: 1 }));
    await fireEvent(tile, "pressIn");
    expect(StyleSheet.flatten(screen.getByTestId("tile").props.style)).toEqual(
      expect.objectContaining({ width: 144, opacity: 0.7 }),
    );
  });
});
