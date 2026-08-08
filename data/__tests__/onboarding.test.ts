import { onboardingSlides } from "@/data/onboarding";
import { illustrations } from "@/components/illustrations";

describe("supplier onboarding slides", () => {
  it("has three beats with step labels and CTAs", () => {
    expect(onboardingSlides).toHaveLength(3);
    expect(onboardingSlides.map((s) => s.step)).toEqual(["01 / 03", "02 / 03", "03 / 03"]);
    expect(onboardingSlides[0].cta).toBe("Next");
    expect(onboardingSlides[1].cta).toBe("Next");
    expect(onboardingSlides[2].cta).toBe("Get Started");
  });

  it("uses supplier illustration keys that exist in the registry", () => {
    for (const slide of onboardingSlides) {
      expect(illustrations[slide.art]).toBeDefined();
      expect(typeof illustrations[slide.art].aspect).toBe("number");
      expect(illustrations[slide.art].aspect).toBeGreaterThan(0);
    }
  });

  it("does not carry client-themed art keys", () => {
    const arts = onboardingSlides.map((s) => s.art);
    expect(arts).not.toContain("scooter");
    expect(arts).not.toContain("proof");
    expect(arts).not.toContain("workstation");
    expect(arts).toEqual(["storefront", "working", "packages"]);
  });

  it("names supplier outcomes, not client request language", () => {
    const blob = onboardingSlides.map((s) => `${s.title} ${s.body}`).join(" ").toLowerCase();
    expect(blob).toMatch(/job/);
    expect(blob).toMatch(/shop|produce|hand off|paid|pickup|self-qc|settlement/);
    expect(blob).not.toMatch(/messenger back-and-forth/);
    expect(blob).not.toMatch(/watch it come to you/);
  });
});
