import {
  DEFAULT_JOB_BOARD_QUERY,
  emptyJobBoardCopy,
  filterJobs,
  JOB_SORTS,
  jobBoardCountCopy,
  jobMatchesFind,
  jobMatchesStage,
  jobStageCounts,
  sortJobs,
} from "@/lib/jobBoard";

const NOW = new Date("2026-09-01T05:00:00.000Z");

function job(partial: {
  id: string;
  title?: string;
  state: string;
  promisedDate?: string | null;
  createdAt?: string;
}) {
  return {
    id: partial.id,
    title: partial.title ?? partial.id,
    state: partial.state,
    promisedDate: partial.promisedDate ?? null,
    deadline: null,
    readyBy: null,
    createdAt: partial.createdAt ?? "2026-08-31T00:00:00.000Z",
  };
}

describe("job board find and stamps", () => {
  it("finds a docket by part of its name", () => {
    expect(jobMatchesFind(job({ id: "a", title: "Thesis reprint, 7 copies", state: "production" }), "thesis")).toBe(
      true,
    );
    expect(jobMatchesFind(job({ id: "a", title: "Flyers", state: "production" }), "thesis")).toBe(false);
  });

  it("stamps late from the promised date, not from the status chip", () => {
    const late = job({
      id: "late",
      state: "awaiting_collection",
      promisedDate: "2026-08-31T04:00:00.000Z",
    });
    const ok = job({
      id: "ok",
      state: "awaiting_collection",
      promisedDate: "2026-09-04T04:00:00.000Z",
    });
    expect(jobMatchesStage(late, "late", NOW)).toBe(true);
    expect(jobMatchesStage(ok, "late", NOW)).toBe(false);
    expect(jobMatchesStage(late, "waiting_on_client", NOW)).toBe(true);
  });

  it("offers three sorts — due date, newest, name — and never a second Late", () => {
    expect(JOB_SORTS.map((row) => row.value)).toEqual(["due_first", "newest", "name"]);
    expect(JOB_SORTS.map((row) => row.label)).toEqual(["Due date first", "Newest first", "A–Z"]);
    expect(jobBoardCountCopy(1, 1)).toBe("1 job");
    expect(jobBoardCountCopy(3, 7)).toBe("3 of 7 jobs");
  });

  it("puts the soonest due first — overdue is already first — and undated last", () => {
    const undated = job({ id: "u", state: "out_for_delivery", promisedDate: null });
    const later = job({ id: "b", state: "production", promisedDate: "2026-09-10T00:00:00.000Z" });
    const soon = job({ id: "a", state: "production", promisedDate: "2026-09-03T00:00:00.000Z" });
    const overdue = job({ id: "z", state: "production", promisedDate: "2026-08-01T00:00:00.000Z" });
    expect(sortJobs([undated, later, soon, overdue], "due_first", NOW).map((row) => row.id)).toEqual([
      "z",
      "a",
      "b",
      "u",
    ]);
  });

  it("counts stamps off the whole floor, not the current find", () => {
    const jobs = [
      job({ id: "1", state: "production" }),
      job({ id: "2", state: "supplier_self_qc" }),
      job({ id: "3", state: "out_for_delivery" }),
      job({ id: "4", state: "ready_for_dispatch" }),
    ];
    const counts = jobStageCounts(jobs, NOW);
    expect(counts.all).toBe(4);
    expect(counts.on_press).toBe(1);
    expect(counts.self_qc).toBe(1);
    expect(counts.with_rider).toBe(1);
    expect(counts.packed).toBe(1);
  });

  it("narrows then sorts", () => {
    const jobs = [
      job({ id: "fly-b", title: "Flyers", state: "out_for_delivery", promisedDate: "2026-09-08T00:00:00.000Z" }),
      job({ id: "fly-a", title: "Flyers", state: "out_for_delivery", promisedDate: "2026-09-02T00:00:00.000Z" }),
      job({ id: "thesis", title: "Thesis reprint", state: "supplier_self_qc" }),
    ];
    const found = filterJobs(jobs, { ...DEFAULT_JOB_BOARD_QUERY, q: "flyer", sort: "due_first" }, NOW);
    expect(found.map((row) => row.id)).toEqual(["fly-a", "fly-b"]);
  });

  it("says why the docket is empty in the shop's words", () => {
    expect(emptyJobBoardCopy({ ...DEFAULT_JOB_BOARD_QUERY, q: "banner" }).title).toMatch(/name/i);
    expect(emptyJobBoardCopy({ ...DEFAULT_JOB_BOARD_QUERY, stage: "late" }).title).toMatch(/late/i);
  });
});
