import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: null }),
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listJobs: jest.fn(async () => []),
  listNotifications: jest.fn(async () => []),
  getSupplierReadiness: jest.fn(),
  getDownloadUrl: jest.fn(async () => ({
    url: "https://example.test/sample.jpg",
    expiresInSeconds: 300,
  })),
}));

jest.mock("@/lib/listingsApi", () => ({
  ...jest.requireActual("@/lib/listingsApi"),
  loadBoard: jest.fn(),
}));

jest.mock("@/hooks/useBoard", () => ({
  ...jest.requireActual("@/hooks/useBoard"),
  loadServiceLines: jest.fn(async () => []),
}));

import HomeScreen from "@/app/(tabs)/home";
import { router } from "expo-router";
import * as api from "@/lib/api";
import type { User } from "@/lib/api";
import type { Listing } from "@/lib/listings";
import { loadBoard } from "@/lib/listingsApi";
import { useSession } from "@/store/session";

/**
 * Home's shop status is GRIDGO's matching verdict (`operational.ready`),
 * never the approval checklist — gridgoph/gridgo-supplier#100.
 */

const pendingShop: User = {
  id: "u1",
  email: "shop@example.com",
  name: "Ben",
  role: "supplier",
  supplierName: "PrintRight",
  verificationStatus: "pending",
};
const approvedShop: User = { ...pendingShop, verificationStatus: "approved" };

function listing(id: string, name: string): Listing {
  return {
    id,
    serviceLineId: "svc_1",
    subcategoryCode: "flyers",
    name,
    description: "",
    basePriceMinor: 45000,
    pricingUnit: "per_unit",
    packageQty: null,
    measureUnit: null,
    minimumWidthMilli: null,
    minimumHeightMilli: null,
    minimumLengthMilli: null,
    printerMaxWidthFeet: null,
    minimumOrderQuantity: null,
    priceTiers: [],
    speedTiers: [],
    turnaroundMode: "override",
    turnaroundDays: 1,
    fileFormatMode: "override",
    formatCodes: ["pdf"],
    onTheBoard: true,
    sortOrder: 0,
    photos: [{ fileId: `f_${id}`, sortOrder: 0, altText: null }],
    groups: [],
    version: 1,
    updatedAt: null,
  };
}

const step = (code: string, message: string, action: string) => ({ code, message, action });
const PHOTO = step("photo", "Attach at least one fully uploaded listing photo.", "upload_listing_photo");
const CLOSED = step("shop_closed", "Your shop is marked closed for new work.", "open_shop");
const APPROVAL = step(
  "supplier_not_approved",
  "Your shop needs Operations approval before clients can match with it.",
  "view_approval",
);
const NO_LISTING = step(
  "no_matchable_listing",
  "No listing is eligible for matching. Complete the steps listed for your listings, or add a listing.",
  "edit_listings",
);
const SHOP_IMAGE = step(
  "shop_identity_image",
  "Upload a shop identity image to complete your shop setup.",
  "upload_shop_image",
);

function signIn(user: User) {
  useSession.setState({
    user,
    loading: false,
    error: null,
    authSource: "clerk",
    identity: { kind: "supplier" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadBoard as jest.Mock).mockResolvedValue({
    status: "ok",
    value: { listings: [listing("item_a", "Flyers A5"), listing("item_b", "Calling cards")], total: 2, nextCursor: null },
  });
});

afterEach(() => {
  useSession.setState({
    user: null,
    loading: false,
    error: null,
    authSource: "none",
    identity: { kind: "signed_out" },
  });
});

it("never says Not ready about a matchable shop with setup gaps, and keeps the gaps gentle", async () => {
  signIn(approvedShop);
  (api.getSupplierReadiness as jest.Mock).mockResolvedValue({
    readyForApproval: false,
    missing: ["shop_identity_image"],
    operational: {
      ready: true,
      missing: [],
      listings: [
        { catalogItemId: "item_a", ready: true, missing: [] },
        { catalogItemId: "item_b", ready: true, missing: [] },
      ],
    },
    profileCompletion: { complete: false, missing: [SHOP_IMAGE], services: [] },
  });

  const view = await render(<HomeScreen />);

  expect(await screen.findByText("Open for new work")).toBeTruthy();
  expect(screen.getByText("Clients can be matched with 2 listings")).toBeTruthy();
  expect(screen.queryByText("Not ready")).toBeNull();
  expect(screen.getByText("Finish your shop setup")).toBeTruthy();
  expect(screen.getByText(SHOP_IMAGE.message)).toBeTruthy();
  expect(
    screen.getByText("Clients can already be matched with you. These round out your shop."),
  ).toBeTruthy();
  await view.unmount();
});

it("lists every missing step with a button to its fix", async () => {
  signIn(approvedShop);
  (api.getSupplierReadiness as jest.Mock).mockResolvedValue({
    operational: {
      ready: false,
      missing: [CLOSED, NO_LISTING],
      listings: [
        { catalogItemId: "item_a", ready: false, missing: [PHOTO, CLOSED] },
        { catalogItemId: "item_b", ready: false, missing: [CLOSED] },
      ],
    },
    profileCompletion: { complete: true, missing: [], services: [] },
  });

  const view = await render(<HomeScreen />);

  expect(await screen.findByText("Not ready")).toBeTruthy();
  // The board step opens into one listing, so the count names it.
  expect(screen.getByText("1 step and 1 listing left")).toBeTruthy();
  expect(screen.getByText(CLOSED.message)).toBeTruthy();
  expect(screen.getByText(NO_LISTING.message)).toBeTruthy();
  // The board step opens into the listing that needs work, by name.
  expect(screen.getByText("Flyers A5")).toBeTruthy();
  expect(screen.getByText(PHOTO.message)).toBeTruthy();

  await fireEvent.press(screen.getByText("Add a photo"));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/shop/[id]/photos", params: { id: "item_a" } });

  await fireEvent.press(screen.getByText("Message Operations"));
  expect(router.push).toHaveBeenCalledWith("/chat");
  await view.unmount();
});

it("shows a waiting shop its whole list, approval included", async () => {
  signIn(pendingShop);
  (api.getSupplierReadiness as jest.Mock).mockResolvedValue({
    operational: {
      ready: false,
      missing: [APPROVAL, NO_LISTING],
      listings: [{ catalogItemId: "item_a", ready: false, missing: [PHOTO, APPROVAL] }],
    },
    profileCompletion: { complete: true, missing: [], services: [] },
  });

  const view = await render(<HomeScreen />);

  expect(await screen.findByText(APPROVAL.message)).toBeTruthy();
  expect(screen.queryByText("Operations is reviewing your shop")).toBeNull();
  await fireEvent.press(screen.getByText("Open accreditation"));
  expect(router.push).toHaveBeenCalledWith("/accreditation");
  await view.unmount();
});

it("falls back to today's Home when the API has no operational verdict", async () => {
  signIn(pendingShop);
  (api.getSupplierReadiness as jest.Mock).mockResolvedValue({
    readyForApproval: false,
    missing: ["review_ready_service_line"],
    publishableServiceIds: [],
  });

  const view = await render(<HomeScreen />);

  expect(await screen.findByText("Operations is reviewing your shop")).toBeTruthy();
  expect(screen.queryByText("Not ready")).toBeNull();
  expect(screen.queryByText("Open for new work")).toBeNull();
  expect(screen.queryByText("Finish your shop setup")).toBeNull();
  await view.unmount();
});

it("counts listings in the chip and does not repeat them in the older board card", async () => {
  signIn(approvedShop);
  const unfinished = (id: string, name: string) => ({ ...listing(id, name), photos: [] });
  (loadBoard as jest.Mock).mockResolvedValue({
    status: "ok",
    value: {
      listings: [unfinished("item_a", "Flyers A5"), unfinished("item_b", "Calling cards"), unfinished("item_c", "Stickers")],
      total: 3,
      nextCursor: null,
    },
  });
  (api.getSupplierReadiness as jest.Mock).mockResolvedValue({
    operational: {
      ready: false,
      missing: [NO_LISTING],
      listings: ["item_a", "item_b", "item_c"].map((catalogItemId) => ({
        catalogItemId,
        ready: false,
        missing: [PHOTO],
      })),
    },
    profileCompletion: { complete: true, missing: [], services: [] },
  });

  const view = await render(<HomeScreen />);

  expect(await screen.findByText("Clients cannot be matched with your shop yet")).toBeTruthy();
  expect(screen.getByText("3 listings need work")).toBeTruthy();
  expect(screen.queryByText("1 step left")).toBeNull();
  expect(screen.queryByText("3 listings are not finished")).toBeNull();
  expect(screen.queryByText("Finish your board")).toBeNull();
  expect(screen.queryByText("YOUR BOARD")).toBeNull();
  await view.unmount();
});

it("keeps the board card when GRIDGO sends no verdict to draw instead", async () => {
  signIn(approvedShop);
  (loadBoard as jest.Mock).mockResolvedValue({
    status: "ok",
    value: { listings: [{ ...listing("item_a", "Flyers A5"), photos: [] }], total: 1, nextCursor: null },
  });
  (api.getSupplierReadiness as jest.Mock).mockResolvedValue({
    readyForApproval: false,
    missing: [],
  });

  const view = await render(<HomeScreen />);

  expect(await screen.findByText("One listing is not finished")).toBeTruthy();
  expect(screen.getByText("Finish your board")).toBeTruthy();
  expect(screen.queryByText("Clients cannot be matched with your shop yet")).toBeNull();
  await view.unmount();
});
