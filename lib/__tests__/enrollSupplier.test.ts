import * as api from "@/lib/api";

const supplierUser = {
  id: "supplier_1",
  email: "shop@example.com",
  name: "Ben Santos",
  role: "supplier" as const,
  supplierName: "PrintRight Davao",
  verificationStatus: "pending" as const,
};

const enrollment = {
  profile: {
    shopName: "PrintRight Davao",
    contactName: "Ben Santos",
    phone: "09171234567",
    location: { lat: 7.0644, lng: 125.6085, label: "C.M. Recto St, Davao City" },
  },
  serviceCategories: ["marketing_collateral"],
};

describe("enrollSupplier", () => {
  beforeEach(() => {
    api.setToken(null);
    api.setTokenProvider(async () => "clerk-jwt");
  });

  afterEach(() => {
    api.setToken(null);
    api.setTokenProvider(null);
    jest.restoreAllMocks();
  });

  it("posts the enroll body with an Idempotency-Key and never calls /auth/signup", async () => {
    const fetch = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/auth/clerk/enroll/supplier")) {
        return {
          ok: true,
          status: 201,
          text: async () => JSON.stringify({ user: { id: supplierUser.id } }),
        } as Response;
      }
      if (url.includes("/auth/me")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ user: supplierUser }),
        } as Response;
      }
      throw new Error(`unexpected ${url}`);
    });

    await expect(api.enrollSupplier(enrollment, "supplier-enroll-test")).resolves.toEqual(
      supplierUser,
    );

    const urls = fetch.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes("/auth/clerk/enroll/supplier"))).toBe(true);
    expect(urls.some((url) => url.includes("/auth/signup"))).toBe(false);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        "Idempotency-Key": "supplier-enroll-test",
        Authorization: "Bearer clerk-jwt",
      }),
    });
    expect(JSON.parse(String((fetch.mock.calls[0][1] as RequestInit).body))).toEqual(enrollment);
  });
});
