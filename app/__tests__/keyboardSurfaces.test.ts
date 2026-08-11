import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function relative(file: string): string {
  return path.relative(ROOT, file);
}

/** Anything that opens a soft keyboard when it is tapped. */
const OPENS_A_KEYBOARD = /<(TextInput|TextField|NoteField|MoneyField)\b/;

/**
 * Somewhere in this file's own tree, the keyboard is accounted for: either the
 * app's keyboard-aware scroll surface, or the avoiding view the two map screens
 * use because their content is a map rather than a scroll.
 */
const HANDLES_A_KEYBOARD = /<(FormScrollView|KeyboardAvoidingView|OnboardingStep|FlowScreen)\b/;

/**
 * The controls themselves — a text field is not a screen, and cannot know what
 * it will be put inside.
 */
const CONTROLS = "components/controls";

/**
 * The captain's report: "typing covers the field".
 *
 * Fixing the two screens somebody happened to notice is how this comes back, so
 * the rule is enumerated rather than remembered: a file that draws a field it
 * can be typed into either sits in a keyboard-aware surface itself, or is
 * composed into one by a shell it names.
 *
 * `components/ShopLocationPicker` is the deliberate exception and is listed
 * here by name: it is a component rather than a screen, and both screens that
 * use it wrap it in the avoiding view — its own content is a full-height map,
 * so shrinking is the only thing that can move its address field into view.
 */
const HANDLED_BY_ITS_CALLERS = ["components/ShopLocationPicker.tsx"];

describe("every field a shop types into sits in a keyboard-aware surface", () => {
  const files = [
    ...sourceFiles(path.join(ROOT, "app")),
    ...sourceFiles(path.join(ROOT, "components")),
  ];

  const withFields = files.filter((file) => {
    if (relative(file).startsWith(CONTROLS)) return false;
    return OPENS_A_KEYBOARD.test(fs.readFileSync(file, "utf8"));
  });

  it("finds the screens that take typing", () => {
    // Sign-in, the sign-up identity step, four job flows, the closure form and
    // the shop's pin. If this drops, the search above stopped matching.
    expect(withFields.length).toBeGreaterThanOrEqual(8);
  });

  it("leaves none of them to the platform's defaults", () => {
    const unhandled = withFields
      .map(relative)
      .filter((file) => !HANDLED_BY_ITS_CALLERS.includes(file))
      .filter((file) => !HANDLES_A_KEYBOARD.test(fs.readFileSync(path.join(ROOT, file), "utf8")));

    expect(unhandled).toEqual([]);
  });

  it("keeps the one exception wrapped by every screen that uses it", () => {
    const users = files.filter((file) =>
      /<ShopLocationPicker\b/.test(fs.readFileSync(file, "utf8")),
    );

    expect(users.length).toBeGreaterThanOrEqual(2);
    for (const file of users) {
      const source = fs.readFileSync(file, "utf8");
      expect({ file: relative(file), handled: HANDLES_A_KEYBOARD.test(source) }).toEqual({
        file: relative(file),
        handled: true,
      });
    }
  });

  it("has retired React Native's own KeyboardAvoidingView", () => {
    const stragglers = files
      .map(relative)
      .filter((file) => {
        const source = fs.readFileSync(path.join(ROOT, file), "utf8");
        return (
          /KeyboardAvoidingView/.test(source) &&
          !/from "react-native-keyboard-controller"/.test(source)
        );
      });

    // RN's own shifts a container without knowing which field is focused, and
    // does nothing at all on Android. One import, one behaviour.
    expect(stragglers).toEqual([]);
  });
});
