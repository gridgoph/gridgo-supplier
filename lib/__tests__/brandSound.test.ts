import { loadBrandStings } from "@/lib/brandSound";

/**
 * The opening's sound is decoration, and the rule that matters is what happens
 * when it is not available: a binary built before `expo-audio` was added has
 * no audio native module, and the launch overlay has to run silent rather than
 * take the app down on the way in. Jest is exactly that environment — there is
 * no native module here — so this asserts the real fallback rather than a mock
 * of it.
 */
describe("loadBrandStings", () => {
  it("runs the opening silent instead of failing when a build has no audio", () => {
    expect(loadBrandStings()).toBeNull();
  });
});
