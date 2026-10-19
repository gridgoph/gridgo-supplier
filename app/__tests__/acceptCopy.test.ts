import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

// A shop never prices a job. The client orders a listing at the shop's price
// and pays first; Accept only confirms the shop can run it.
describe("accepting a job", () => {
  it("is never described as naming a price", () => {
    for (const path of ["lib/homeBoard.ts", "app/payout.tsx", "lib/tour.ts"]) {
      expect(source(path)).not.toMatch(/name (your|the) price/i);
    }
  });

  it("says where a first payout comes from on the empty Payout screen", () => {
    expect(source("app/payout.tsx")).toContain(
      "When a client orders from your board and you accept the job, the parts you are paid in appear here as you work through it.",
    );
  });
});
