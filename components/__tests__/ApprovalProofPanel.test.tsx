import { render, screen } from "@testing-library/react-native";

import { ApprovalProofPanel } from "@/components/ApprovalProofPanel";
import * as api from "@/lib/api";
import { parseApprovalProofs } from "@/lib/approvalProof";

/**
 * The client's approval, read-only on the job (gridgo-client#248): what was
 * approved, when and how, the signature and the received sample — and never
 * the client's name, email or device.
 */

jest.mock("@/lib/api", () => ({ getApprovalProof: jest.fn() }));

jest.mock("@/hooks/useSignedLink", () => ({
  useSignedLink: (fileId: string) => ({
    uri: `https://example.test/${fileId}`,
    loading: false,
    failed: false,
    onError: jest.fn(),
    onLoad: jest.fn(),
  }),
}));

const record = {
  id: "apr_1",
  phase: "sample",
  status: "approved",
  method: "drawn",
  at: "2026-10-17T07:40:00.000Z",
  account: { id: "usr_1", name: "Juan Dela Cruz", email: "client@example.test" },
  device: { id: "install-1", platform: "android", appVersion: "2.4.8" },
  statement: "I approve this order",
  signatureFileId: "file_sig",
  samplePhotoFileId: "file_sample",
  snapshot: {
    items: [{ itemNameSnapshot: "Mugs", quantity: 50, options: [{ groupNameSnapshot: "Colour", optionLabelSnapshot: "White" }] }],
    artwork: [{ fileId: "file_art" }],
  },
  snapshotSha256: "aa11bb22cc33dd44",
};

it("shows the signed sample, the signature and what was approved, without the client's identity", async () => {
  jest.mocked(api.getApprovalProof).mockResolvedValue(parseApprovalProofs([record]));
  await render(<ApprovalProofPanel orderId="ord_1" />);

  expect(await screen.findByText("Sample approval")).toBeTruthy();
  expect(screen.getByText("Signed")).toBeTruthy();
  expect(screen.getByText("Drawn signature · Oct 17, 3:40 PM")).toBeTruthy();
  expect(screen.getByText("“I approve this order”")).toBeTruthy();
  expect(screen.getByLabelText("The client's signature").props.source.uri).toBe("https://example.test/file_sig");
  expect(screen.getByLabelText("The sample the client received").props.source.uri).toBe(
    "https://example.test/file_sample",
  );
  expect(screen.getByText("50 × Mugs")).toBeTruthy();
  expect(screen.getByText("Colour: White")).toBeTruthy();
  expect(screen.getByText("Approved with 1 print file")).toBeTruthy();
  expect(screen.getByText("Record AA11BB22CC33")).toBeTruthy();
  expect(screen.queryByText(/Juan/)).toBeNull();
  expect(screen.queryByText(/client@example\.test/)).toBeNull();
  expect(screen.queryByText(/android/)).toBeNull();
});

it("says plainly when no approval was collected", async () => {
  jest.mocked(api.getApprovalProof).mockResolvedValue(
    parseApprovalProofs([{ ...record, phase: "checkout", status: "legacy_unrecorded", method: null }]),
  );
  await render(<ApprovalProofPanel orderId="ord_1" />);
  expect(await screen.findByText("No approval collected")).toBeTruthy();
  expect(screen.queryByText("Signed")).toBeNull();
  expect(screen.queryByText("Approved")).toBeNull();
  expect(screen.queryByLabelText("The client's signature")).toBeNull();
});
