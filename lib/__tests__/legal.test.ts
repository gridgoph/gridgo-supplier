import { ApiError, type LegalVersion, type PrivacyRequest } from "@/lib/api";
import {
  applyAgreementLabel,
  applyDocuments,
  changeNote,
  enrollmentConsentBody,
  gateHeading,
  isLegalRefusal,
  isLegalUnsupported,
  isLegalVersionChanged,
  joinTitles,
  legalDate,
  legalStatusLook,
  libraryOrder,
  noticeBody,
  noticeHeading,
  openRequestOf,
  penaltyNote,
  privacyKindTitle,
  privacyRequestLine,
  privacyStatusLook,
  unseenNotices,
  versionLine,
} from "@/lib/legal";

function doc(documentId: string, patch: Partial<LegalVersion> = {}): LegalVersion {
  const titles: Record<string, string> = {
    "terms-of-service": "Terms of Service",
    "privacy-notice": "Privacy Notice",
    "supplier-agreement": "Supplier Agreement",
    "acceptable-use": "Acceptable Use and Artwork Rights",
    "cookie-notice": "Cookie Notice",
  };
  return {
    id: `${documentId}-1`,
    documentId,
    version: 1,
    title: titles[documentId] ?? documentId,
    audience: "all",
    text: "Placeholder text.",
    effectiveAt: "2026-10-09T02:00:00.000Z",
    placeholder: true,
    material: false,
    penalties: false,
    changeSummary: "Launch placeholder",
    status: "placeholder",
    ...patch,
  };
}

function refusal(code: string, status = 400) {
  return new ApiError(status, { error: code, message: code });
}

describe("the library", () => {
  it("leads with the Supplier Agreement, then Terms and Privacy, then the rest by title", () => {
    const ordered = libraryOrder([
      doc("cookie-notice"),
      doc("zz-new-slot", { title: "Another Policy" }),
      doc("privacy-notice"),
      doc("terms-of-service"),
      doc("supplier-agreement"),
      doc("acceptable-use"),
    ]);
    expect(ordered.map((d) => d.documentId)).toEqual([
      "supplier-agreement",
      "terms-of-service",
      "privacy-notice",
      "acceptable-use",
      "cookie-notice",
      "zz-new-slot",
    ]);
  });

  it("finds the three apply documents, or nothing while one is missing", () => {
    const all = [doc("cookie-notice"), doc("supplier-agreement"), doc("privacy-notice"), doc("terms-of-service")];
    expect(applyDocuments(all)?.map((d) => d.id)).toEqual([
      "terms-of-service-1",
      "privacy-notice-1",
      "supplier-agreement-1",
    ]);
    expect(applyDocuments(all.filter((d) => d.documentId !== "supplier-agreement"))).toBeNull();
    expect(applyDocuments(null)).toBeNull();
  });

  it("names documents as a sentence", () => {
    expect(joinTitles([])).toBe("");
    expect(joinTitles([doc("terms-of-service")])).toBe("Terms of Service");
    expect(joinTitles([doc("terms-of-service"), doc("privacy-notice"), doc("supplier-agreement")])).toBe(
      "Terms of Service, Privacy Notice and Supplier Agreement",
    );
  });

  it("dates a version in Davao time", () => {
    // 20:00 UTC on 8 Oct is already 9 Oct in Davao.
    expect(legalDate("2026-10-08T20:00:00.000Z")).toBe("9 Oct 2026");
    expect(legalDate(null)).toBeNull();
    expect(legalDate("not a date")).toBeNull();
    expect(versionLine(doc("terms-of-service", { version: 2 }))).toBe(
      "Version 2, in effect from 9 Oct 2026",
    );
  });

  it("says Placeholder whenever the text is still a placeholder", () => {
    expect(legalStatusLook(doc("terms-of-service")).label).toBe("Placeholder");
    expect(legalStatusLook(doc("terms-of-service", { placeholder: false, status: "live" })).label).toBe(
      "In effect",
    );
  });

  it("shows a later version's change summary, never the launch placeholder's", () => {
    expect(changeNote(doc("terms-of-service"))).toBeNull();
    expect(changeNote(doc("terms-of-service", { version: 2, changeSummary: "  Pickup terms  " }))).toBe(
      "Pickup terms",
    );
    expect(changeNote(doc("terms-of-service", { version: 2, changeSummary: "" }))).toBeNull();
  });

  it("speaks about money only for a version that allows deductions", () => {
    expect(penaltyNote(doc("supplier-agreement"))).toBeNull();
    expect(penaltyNote(doc("supplier-agreement", { penalties: true }))).toMatch(/only once you agree/);
  });
});

describe("agreeing at apply", () => {
  it("names the exact versions shown and never ticks marketing for the shop", () => {
    const body = enrollmentConsentBody(
      ["terms-of-service-1", "privacy-notice-1", "supplier-agreement-1"],
      { agreed: true, marketing: false },
      { app: "gridgo-supplier/1.0.0", device: "supplier-abc" },
    );
    expect(body).toEqual({
      accepted: true,
      versionIds: ["terms-of-service-1", "privacy-notice-1", "supplier-agreement-1"],
      method: "checkbox",
      junior: false,
      marketing: false,
      app: "gridgo-supplier/1.0.0",
      device: "supplier-abc",
    });
    expect(enrollmentConsentBody([], { agreed: true, marketing: true }, { app: "a", device: "d" }).marketing).toBe(
      true,
    );
  });

  it("puts the age declaration in the box the shop ticks", () => {
    expect(applyAgreementLabel(null)).toBe(
      "I am 18 or older and agree, for this shop, to the Terms of Service, Privacy Notice and Supplier Agreement",
    );
  });

  it("tells a legal refusal from any other failure", () => {
    expect(isLegalRefusal(refusal("legal_consent_required"))).toBe(true);
    expect(isLegalRefusal(refusal("unsupported_legal_consent_version"))).toBe(true);
    expect(isLegalRefusal(refusal("application_already_exists", 409))).toBe(false);
    expect(isLegalRefusal(new Error("offline"))).toBe(false);
    expect(isLegalVersionChanged(refusal("legal_version_changed", 409))).toBe(true);
    expect(isLegalUnsupported(new ApiError(404, null))).toBe(true);
    expect(isLegalUnsupported(refusal("legal_consent_required"))).toBe(false);
  });
});

describe("the agreement screen and notices", () => {
  it("says terms have changed only for a later version", () => {
    expect(gateHeading([doc("supplier-agreement")])).toBe("Agree to GRIDGO's terms");
    expect(gateHeading([doc("supplier-agreement", { version: 2 })])).toBe("GRIDGO's terms have changed");
  });

  it("shows a notice once per phone", () => {
    const notices = [doc("cookie-notice"), doc("terms-of-service", { id: "t-2", version: 2 })];
    expect(unseenNotices(notices, ["cookie-notice-1"]).map((d) => d.id)).toEqual(["t-2"]);
    expect(unseenNotices(notices, ["cookie-notice-1", "t-2"])).toEqual([]);
  });

  it("words a notice by how many and whether it is an update", () => {
    expect(noticeHeading([doc("terms-of-service", { version: 2 })])).toBe(
      "GRIDGO updated its Terms of Service",
    );
    expect(noticeHeading([doc("cookie-notice")])).toBe("New to read: Cookie Notice");
    expect(noticeHeading([doc("cookie-notice"), doc("acceptable-use")])).toBe("2 GRIDGO policies to read");
    // One real update among policies never opened is still one update.
    expect(noticeHeading([doc("cookie-notice"), doc("terms-of-service", { version: 2 })])).toBe(
      "GRIDGO updated its Terms of Service",
    );
    expect(noticeBody([doc("cookie-notice"), doc("terms-of-service", { version: 2 })])).toBe(
      "Terms of Service and Cookie Notice. Nothing to agree to. They stay in Account, under Legal & Privacy.",
    );
    expect(noticeBody([doc("cookie-notice")])).toBe(
      "Nothing to agree to. It stays in Account, under Legal & Privacy.",
    );
  });
});

describe("privacy requests", () => {
  const base: PrivacyRequest = {
    id: "pr_1",
    kind: "access",
    status: "pending",
    requestedAt: "2026-10-09T02:00:00.000Z",
    dueAt: "2026-10-24T02:00:00.000Z",
    updatedAt: "2026-10-09T02:00:00.000Z",
  };

  it("names each kind and status in words", () => {
    expect(privacyKindTitle("access")).toBe("See my data");
    expect(privacyKindTitle("correction")).toBe("Correct my data");
    expect(privacyKindTitle("deletion")).toBe("Delete my account");
    expect(privacyKindTitle("something_new")).toBe("Privacy request");
    expect(privacyStatusLook("pending").label).toBe("Received");
    expect(privacyStatusLook("in_progress").label).toBe("In progress");
    expect(privacyStatusLook("completed").label).toBe("Done");
    expect(privacyStatusLook("rejected").label).toBe("Declined");
  });

  it("gives the answer-by date while open and the close date once closed", () => {
    expect(privacyRequestLine(base)).toBe("Sent 9 Oct 2026, answer due by 24 Oct 2026");
    expect(
      privacyRequestLine({ ...base, status: "completed", updatedAt: "2026-10-12T02:00:00.000Z" }),
    ).toBe("Sent 9 Oct 2026, closed 12 Oct 2026");
  });

  it("finds an open request of the same kind only", () => {
    const done = { ...base, id: "pr_0", status: "completed" };
    expect(openRequestOf([done], "access")).toBeNull();
    expect(openRequestOf([done, base], "access")?.id).toBe("pr_1");
    expect(openRequestOf([base], "correction")).toBeNull();
  });
});
