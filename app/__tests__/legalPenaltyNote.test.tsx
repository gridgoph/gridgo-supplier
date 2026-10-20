import { render, screen } from "@testing-library/react-native";

import LegalDocumentScreen from "@/app/legal/[versionId]";
import LegalReviewScreen from "@/app/legal/review";
import { getLegalVersion, type LegalVersion } from "@/lib/api";
import { NO_MONEY_TAKEN } from "@/lib/performance";
import { useLegalConsent } from "@/store/legalConsent";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ versionId: "supplier-agreement-2" }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getLegalVersion: jest.fn(),
}));

const agreement: LegalVersion = {
  id: "supplier-agreement-2",
  documentId: "supplier-agreement",
  version: 2,
  title: "Supplier Agreement",
  audience: "supplier",
  text: "Clause 9: Late production.",
  effectiveAt: "2026-10-20T00:00:00.000Z",
  placeholder: false,
  material: true,
  penalties: true,
  changeSummary: "Adds the late-production clause",
  status: "live",
};

const OLD_LINE = /applies only once you agree/;

/** Warnings only (gridgo-api SUPPLIER_PERFORMANCE_API.md): accepting does not enable deductions. */
describe("a Supplier Agreement that allows late deductions", () => {
  afterEach(() => jest.clearAllMocks());

  it("promises no money is taken on the agreement screen", async () => {
    useLegalConsent.setState({ pending: [agreement], notices: [] });
    await render(<LegalReviewScreen />);
    expect(screen.getByText("What this means for your pay")).toBeTruthy();
    expect(screen.getByText(NO_MONEY_TAKEN)).toBeTruthy();
    expect(screen.getByText(/does not use it during the current pilot/)).toBeTruthy();
    expect(screen.queryByText(OLD_LINE)).toBeNull();
  });

  it("promises no money is taken on the document itself", async () => {
    (getLegalVersion as jest.Mock).mockResolvedValue(agreement);
    await render(<LegalDocumentScreen />);
    expect(await screen.findByText(NO_MONEY_TAKEN)).toBeTruthy();
    expect(screen.getByText(/agreeing does not change that/)).toBeTruthy();
    expect(screen.getByText("Clause 9: Late production.")).toBeTruthy();
    expect(screen.queryByText(OLD_LINE)).toBeNull();
  });
});
