import { readFileSync } from "fs";
import { join } from "path";

describe("Jobs tab docket", () => {
  it("lets the shop find and stamp jobs on the floor, not only split needs-you", () => {
    const source = readFileSync(join(__dirname, "../(tabs)/jobs.tsx"), "utf8");
    expect(source).toContain("JobDocketRail");
    expect(source).toContain("filterJobs");
    expect(source).toContain("NEEDS YOU");
  });

  it("sorts the floor the way orders do: a named control that opens a sheet", () => {
    const rail = readFileSync(join(__dirname, "../../components/JobDocketRail.tsx"), "utf8");
    expect(rail).toContain("askPick");
    expect(rail).toContain("Sort jobs");
    expect(rail).toContain("ChevronDown");
    expect(rail).not.toContain("SegmentedControl");
    expect(rail).not.toContain("Late first");
  });
});
