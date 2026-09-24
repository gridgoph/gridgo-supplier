import {
  composeProblemReport,
  PROBLEM_REPORT_HEADING,
  PROBLEM_REPORT_MAX,
  problemReportIssue,
  problemReportJobLine,
} from "@/lib/problemReport";

const context = { appVersion: "1.0.42", device: "Android 15, Samsung SM-A155F" };

describe("composeProblemReport", () => {
  it("heads a report from a job with the job, then the words, then the build and phone", () => {
    const body = composeProblemReport({
      what: "  The packing photo will not upload.\r\nIt stops at 100%.  ",
      job: { orderId: "ord_3ff0128e105a", title: "Tarpaulin 3x6 ft" },
      context,
    });
    expect(body).toBe(
      [
        "Problem report",
        "Job: Tarpaulin 3x6 ft",
        "Order 3FF0-128E-105A (ord_3ff0128e105a)",
        "",
        "The packing photo will not upload.\nIt stops at 100%.",
        "",
        "App: GRIDGO Supplier 1.0.42",
        "Phone: Android 15, Samsung SM-A155F",
      ].join("\n"),
    );
  });

  it("leaves out the job lines when it is not about a job", () => {
    const body = composeProblemReport({ what: "Earnings will not load.", context });
    expect(body.split("\n")[0]).toBe(PROBLEM_REPORT_HEADING);
    expect(body).not.toMatch(/Order|Job:/);
    expect(body).toContain("Earnings will not load.");
    expect(body).toContain("App: GRIDGO Supplier 1.0.42");
  });

  it("keeps a job's reference when it has no title", () => {
    const body = composeProblemReport({ what: "x", job: { orderId: "ord_3ff0128e105a" }, context });
    expect(body).not.toContain("Job:");
    expect(body).toContain("Order 3FF0-128E-105A (ord_3ff0128e105a)");
  });

  it("fits the chat's 4000-character limit at the longest a shop can type", () => {
    const body = composeProblemReport({
      what: "x".repeat(PROBLEM_REPORT_MAX),
      job: { orderId: "ord_3ff0128e105a", title: "t".repeat(200) },
      context,
    });
    expect(body.length).toBeLessThanOrEqual(4000);
  });
});

describe("problemReportJobLine", () => {
  it("does not repeat an id that is not an order key", () => {
    expect(problemReportJobLine({ orderId: "legacy-7" })).toBe("Order LEGACY-7 (legacy-7)");
    expect(problemReportJobLine({ orderId: "ABCD" })).toBe("Order ABCD");
  });
});

describe("problemReportIssue", () => {
  it("asks for words before a report can go", () => {
    expect(problemReportIssue("   ")).toBe("Say what went wrong before you send it.");
    expect(problemReportIssue("It crashed")).toBeNull();
    expect(problemReportIssue("x".repeat(PROBLEM_REPORT_MAX + 1))).toMatch(/under 1500/);
  });
});
