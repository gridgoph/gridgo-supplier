import { render, screen } from "@testing-library/react-native";

import { SupplierTermsNotice } from "@/components/SupplierTermsNotice";

describe("SupplierTermsNotice", () => {
  it("draws nothing while no term is approved", async () => {
    await render(<SupplierTermsNotice />);
    expect(screen.queryByText("What you agree to by sending this")).toBeNull();
  });

  it("states an approved term where the shop sends its application", async () => {
    await render(<SupplierTermsNotice terms={["You make every order in your own shop."]} />);
    expect(screen.getByText("What you agree to by sending this")).toBeTruthy();
    expect(screen.getByText("You make every order in your own shop.")).toBeTruthy();
  });
});
