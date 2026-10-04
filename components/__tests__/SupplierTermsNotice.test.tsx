import { render, screen } from "@testing-library/react-native";

import { SupplierTermsNotice } from "@/components/SupplierTermsNotice";
import { NO_SUBCONTRACTING_TERM } from "@/lib/supplierTerms";

describe("SupplierTermsNotice", () => {
  it("states the approved no-subcontracting term where the shop sends its application", async () => {
    await render(<SupplierTermsNotice />);
    expect(screen.getByText("What you agree to by sending this")).toBeTruthy();
    expect(screen.getByText(NO_SUBCONTRACTING_TERM as string)).toBeTruthy();
  });

  it("draws nothing when no term is live", async () => {
    await render(<SupplierTermsNotice terms={[]} />);
    expect(screen.queryByText("What you agree to by sending this")).toBeNull();
  });
});
