/* global jest, beforeEach, afterEach, it, expect */
const React = require("react");
const { act, create } = require("react-test-renderer");
const HandoffScreen = require("@/app/job/[id]/handoff").default;

const mockRun = jest.fn();
const mockConfirm = jest.fn();
const mockClear = jest.fn();
const mockReplace = jest.fn();

jest.mock("react-native", () => ({
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
  Platform: { OS: "ios", select: (options) => options.ios ?? options.native ?? options.default },
}));
jest.mock("expo-router", () => ({
  router: { replace: (...args) => mockReplace(...args), back: jest.fn() },
  useLocalSearchParams: () => ({ id: "job" }),
  useFocusEffect: jest.fn(),
}));
jest.mock("@/components/FlowScreen", () => ({
  FlowScreen: ({ children, footer }) => require("react").createElement("View", null, children, footer),
}));
jest.mock("@/components/PrimaryButton", () => ({ PrimaryButton: "PrimaryButton" }));
jest.mock("@/components/SecondaryButton", () => ({ SecondaryButton: "SecondaryButton" }));
jest.mock("@/components/SpecRow", () => ({ SpecRow: "SpecRow" }));
jest.mock("@/components/StatusChip", () => ({ StatusChip: "StatusChip" }));
jest.mock("lucide-react-native", () => ({ ReceiptText: "ReceiptText" }));
jest.mock("@/hooks/useTheme", () => ({ useThemeColors: () => ({ info: "#1565C0" }) }));
let mockJobState = "production";
let mockPlan = {};
jest.mock("@/hooks/useJob", () => ({
  useJob: () => ({
    job: { id: "job", state: mockJobState, title: "Printed job", quantity: 2, payoutMilestones: [], ...mockPlan },
    loading: false, error: null, reload: jest.fn(),
  }),
}));
jest.mock("@/hooks/useJobAction", () => ({
  useJobAction: () => ({ run: (...args) => mockRun(...args), busy: false, error: null }),
}));
jest.mock("@/store/jobDrafts", () => ({
  useJobDrafts: (select) => select({ clearDraft: mockClear }),
}));
jest.mock("@/store/sheets", () => ({ askConfirm: (...args) => mockConfirm(...args) }));

let rendered;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  mockJobState = "production";
  mockPlan = {};
  mockConfirm.mockResolvedValue(true);
  mockRun.mockResolvedValue({ id: "job", state: "ready_for_dispatch" });
  await act(async () => { rendered = create(React.createElement(HandoffScreen)); });
});
afterEach(async () => { await act(async () => rendered.unmount()); });

function texts() {
  return rendered.root.findAllByType("Text").map((node) => node.props.children);
}

function press() { rendered.root.findByType("PrimaryButton").props.onPress(); }

it("draws no checklist: readiness is a single signal", () => {
  const checkboxes = rendered.root.findAll(
    (node) => node.props && node.props.accessibilityRole === "checkbox",
  );
  expect(checkboxes).toHaveLength(0);
  const texts = rendered.root.findAllByType("Text").map((node) => node.props.children);
  expect(texts).toContain("The rider comes to your counter");
});

it("submits packaging readiness directly, then returns to the job on confirmed success", async () => {
  await act(async () => press());
  expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job", targetState: "ready_for_dispatch" }));
  expect(mockClear).toHaveBeenCalledWith("job");
  expect(mockReplace).toHaveBeenCalledWith({ pathname: "/job/[id]", params: { id: "job" } });
});

it("opens one confirmation and sends one mutation despite repeated activation", async () => {
  let confirm;
  mockConfirm.mockImplementation(() => new Promise((resolve) => { confirm = resolve; }));
  await act(async () => { press(); press(); });
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(mockRun).not.toHaveBeenCalled();
  expect(rendered.root.findByType("PrimaryButton").props.disabled).toBe(true);
  await act(async () => confirm(true));
  expect(mockRun).toHaveBeenCalledTimes(1);
});

it("retains packing answers after failure and permits an explicit retry", async () => {
  mockRun.mockResolvedValueOnce(null);
  await act(async () => press());
  expect(mockClear).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  await act(async () => press());
  expect(mockRun).toHaveBeenCalledTimes(2);
  expect(mockClear).toHaveBeenCalledWith("job");
});

it("reminds the shop to keep its own invoice out of the package it is packing", () => {
  const shown = texts();
  expect(shown).toContain("No invoice or receipt in the package");
  expect(shown).toContain(
    "Do not put your own invoice or receipt inside the package. GRIDGO buys this job from you and gives the customer its own receipt.",
  );
  expect(shown).toContain("Keep your invoice for GRIDGO. It collects invoices from each shop monthly.");
});

it.each(["ready_for_dispatch", "rider_assigned"])("keeps the invoice reminder up at the counter (%s)", async (state) => {
  mockJobState = state;
  await act(async () => rendered.update(React.createElement(HandoffScreen)));
  expect(texts()).toContain("No invoice or receipt in the package");
});

it.each(["picked_up", "delivered"])("drops the invoice reminder once the rider has the package (%s)", async (state) => {
  mockJobState = state;
  await act(async () => rendered.update(React.createElement(HandoffScreen)));
  expect(texts()).not.toContain("No invoice or receipt in the package");
});

/** The escrow plan has no packing evidence step, so this screen is the one place the reminder lives. */
const escrow = {
  payoutPlanVersion: 2,
  payoutMilestones: [
    { code: "production_started", label: "Start of production", releaseRequires: "shop_proof", sharePercent: 40, amountMinor: 400, status: "pof_attached", pofFileIds: ["start"], releasedAt: null },
    { code: "delivered", label: "Delivered", releaseRequires: "delivery_proof", sharePercent: 35, amountMinor: 350, status: "pending_pof", pofFileIds: [], releasedAt: null },
    { code: "issue_window", label: "Issue window closed", releaseRequires: "issue_window_closed", sharePercent: 25, amountMinor: 250, status: "pending_pof", pofFileIds: [], releasedAt: null },
  ],
};

it.each(["production", "ready_for_dispatch", "rider_assigned"])(
  "keeps the invoice reminder at pickup on a plan-2 job (%s)",
  async (state) => {
    mockJobState = state;
    mockPlan = escrow;
    await act(async () => rendered.update(React.createElement(HandoffScreen)));
    expect(texts()).toContain("No invoice or receipt in the package");
  },
);
