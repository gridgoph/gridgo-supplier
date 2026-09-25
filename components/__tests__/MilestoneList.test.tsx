import { render, screen, waitFor } from "@testing-library/react-native";

import { MilestoneList } from "@/components/MilestoneList";
import type { MilestoneView } from "@/lib/milestones";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFile: jest.fn(async (fileId: string) => ({
    fileId,
    originalFilename: `${fileId}.jpg`,
    detectedContentType: fileId === "file_pdf" ? "application/pdf" : "image/jpeg",
    declaredContentType: "image/jpeg",
  })),
  getDownloadUrl: jest.fn(async (fileId: string) => ({
    fileId,
    url: `https://example.test/${fileId}.jpg`,
    expiresAt: "2099-01-01T00:00:00.000Z",
    expiresInSeconds: 300,
  })),
}));

function view(partial: Partial<MilestoneView> = {}): MilestoneView {
  return {
    code: "printing",
    label: "Printing",
    sharePercent: 50,
    amountMinor: 50000,
    stage: "awaiting_release",
    statusLabel: "With GRIDGO",
    tone: "info",
    icon: "clock",
    detail: "Your evidence is filed. GRIDGO reviews it and releases this part.",
    proofOwner: "shop",
    proofName: "printing",
    proofCount: 1,
    canAddProof: false,
    pofFileIds: ["file_print"],
    receiptFileId: null,
    reference: null,
    ...partial,
  };
}

describe("MilestoneList", () => {
  it("shows the wallet receipt and reference on a released part of the job", async () => {
    await render(
      <MilestoneList
        milestones={[
          view({
            stage: "released",
            statusLabel: "Released",
            tone: "success",
            icon: "circle-check",
            detail: "Sent to you.",
            receiptFileId: "file_receipt",
            reference: "GCASH-777",
          }),
        ]}
        showDetail
      />,
    );
    expect(await screen.findByLabelText("Open the wallet receipt for Printing")).toBeTruthy();
    expect(screen.getByText("Reference GCASH-777")).toBeTruthy();
  });

  it("keeps the receipt off the earnings list, which shows no detail", async () => {
    await render(
      <MilestoneList
        milestones={[view({ stage: "released", receiptFileId: "file_receipt", reference: "GCASH-777" })]}
      />,
    );
    expect(screen.queryByLabelText("Open the wallet receipt for Printing")).toBeNull();
  });

  it("shows filed shop proof photographs on the job", async () => {
    await render(<MilestoneList milestones={[view()]} showDetail />);

    await waitFor(() => {
      expect(screen.getByLabelText("Printing evidence").props.source).toEqual({
        uri: "https://example.test/file_print.jpg",
      });
    });
  });

  it("does not show proof photographs on a payout list of several jobs", async () => {
    await render(<MilestoneList milestones={[view()]} />);

    expect(screen.queryByLabelText("Printing evidence")).toBeNull();
  });

  it("does not show the rider's delivery evidence as a shop proof photo", async () => {
    await render(
      <MilestoneList
        milestones={[
          view({
            code: "delivered",
            label: "Delivered",
            proofOwner: "rider",
            proofName: "delivery",
            pofFileIds: ["file_rider"],
          }),
        ]}
        showDetail
      />,
    );

    expect(screen.queryByLabelText("Delivered evidence")).toBeNull();
  });
});

it("shows a plan-2 start-of-production photo, and lists the parts in the order given", async () => {
  await render(
    <MilestoneList
      milestones={[
        view({
          code: "production_started",
          label: "Start of production",
          sharePercent: 40,
          proofName: "start-of-production",
          pofFileIds: ["file_start"],
        }),
        view({
          code: "delivered",
          label: "Delivered",
          sharePercent: 35,
          proofOwner: "rider",
          proofName: "delivery",
          pofFileIds: ["file_rider"],
        }),
        view({
          code: "issue_window",
          label: "Issue window closed",
          sharePercent: 25,
          proofOwner: "window",
          proofName: "issue window",
          pofFileIds: [],
        }),
      ]}
      showDetail
    />,
  );

  await waitFor(() => {
    expect(screen.getByLabelText("Start of production evidence").props.source).toEqual({
      uri: "https://example.test/file_start.jpg",
    });
  });
  expect(screen.queryByLabelText("Delivered evidence")).toBeNull();
  const shares = screen.getAllByText(/% of this job$/).map((node) => node.props.children.join(""));
  expect(shares).toEqual(["40% of this job", "35% of this job", "25% of this job"]);
});

it("renders a stored PDF as a document even when its name suggests an image", async () => {
  await render(<MilestoneList milestones={[view({ pofFileIds: ["file_pdf"] })]} showDetail />);
  expect(await screen.findByText("PDF")).toBeTruthy();
  expect(screen.getByText("file_pdf.jpg")).toBeTruthy();
  expect(screen.queryByLabelText("Printing evidence")).toBeNull();
});
