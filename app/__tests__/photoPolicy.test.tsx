import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockNavigation = {
  addListener: jest.fn(() => jest.fn()),
};

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useNavigation: () => mockNavigation,
  useLocalSearchParams: () => ({ id: "item_1" }),
}));

jest.mock("@/hooks/useBoard", () => ({
  useListing: jest.fn(),
  routeId: jest.requireActual<typeof import("@/hooks/useBoard")>("@/hooks/useBoard").routeId,
}));

const mockUploads = {
  items: [],
  busy: false,
  takePhoto: jest.fn(async () => {}),
  pickImage: jest.fn(async () => {}),
  pickDocument: jest.fn(async () => {}),
  retry: jest.fn(async () => {}),
  remove: jest.fn(),
  markAttached: jest.fn(),
};

jest.mock("@/hooks/useFileUpload", () => ({
  useFileUpload: () => mockUploads,
}));

jest.mock("@/hooks/useSignedLink", () => ({
  useSignedLink: () => ({ url: null, failed: false, onError: jest.fn(), onLoad: jest.fn() }),
}));

import { router } from "expo-router";

import PhotoPolicySheet from "@/app/shop/photo-policy";
import SamplePhotosScreen from "@/app/shop/[id]/photos";
import { useListing } from "@/hooks/useBoard";
import type { Listing } from "@/lib/listings";
import { PHOTO_POLICY_CONFIRM, photoPolicyDue } from "@/lib/photoPolicy";
import { endPhotoPolicySubmission, ensurePhotoPolicy, usePhotoPolicy } from "@/store/photoPolicy";
import { askPhotoPolicy, settlePhotoPolicy, useSheets } from "@/store/sheets";

function listingWith(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "item_1",
    serviceLineId: "svc_1",
    subcategoryCode: "flyers",
    name: "Event flyers",
    description: "",
    basePriceMinor: 0,
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
    turnaroundMode: "inherit",
    turnaroundDays: null,
    fileFormatMode: "inherit",
    formatCodes: [],
    onTheBoard: false,
    sortOrder: 0,
    photos: [],
    groups: [],
    version: 1,
    updatedAt: null,
    ...overrides,
  };
}

let mockListing: Listing;

beforeEach(() => {
  jest.clearAllMocks();
  mockListing = listingWith();
  usePhotoPolicy.setState({ confirmed: [] });
  useSheets.setState({ photoPolicy: null });
  (useListing as jest.Mock).mockImplementation(() => ({
    listing: mockListing,
    loading: false,
    notOpenYet: false,
    error: null,
    reload: jest.fn(async () => {}),
  }));
});

describe("photoPolicyDue", () => {
  const photo = { fileId: "file_1", sortOrder: 0, altText: null };

  it("asks once per submission and skips a submit with nothing to check", () => {
    expect(photoPolicyDue({ id: "a", photos: [] }, [], "photos")).toBe(true);
    expect(photoPolicyDue({ id: "a", photos: [photo] }, [], "submit")).toBe(true);
    expect(photoPolicyDue({ id: "a", photos: [photo] }, ["a"], "submit")).toBe(false);
    expect(photoPolicyDue({ id: "a", photos: [] }, [], "submit")).toBe(false);
    expect(photoPolicyDue({ id: "b", photos: [photo] }, ["a"], "submit")).toBe(true);
  });
});

describe("ensurePhotoPolicy", () => {
  const listing = { id: "item_1", photos: [{ fileId: "f", sortOrder: 0, altText: null }] };

  it("remembers a confirm for the submission and forgets it when the submission ends", async () => {
    const first = ensurePhotoPolicy(listing, "photos");
    expect(router.push).toHaveBeenCalledWith("/shop/photo-policy");
    settlePhotoPolicy("confirmed");
    await expect(first).resolves.toBe("confirmed");

    (router.push as jest.Mock).mockClear();
    await expect(ensurePhotoPolicy(listing, "submit")).resolves.toBe("confirmed");
    expect(router.push).not.toHaveBeenCalled();

    endPhotoPolicySubmission("item_1");
    void ensurePhotoPolicy(listing, "submit");
    expect(router.push).toHaveBeenCalledWith("/shop/photo-policy");
  });

  it("does not remember a decline", async () => {
    const pending = ensurePhotoPolicy(listing, "photos");
    settlePhotoPolicy("declined");
    await expect(pending).resolves.toBe("declined");
    expect(usePhotoPolicy.getState().confirmed).toEqual([]);
  });
});

describe("Photo policies sheet", () => {
  it("lists the three rules with one confirm for every photo", async () => {
    const pending = askPhotoPolicy({ moment: "photos" });
    await render(<PhotoPolicySheet />);

    expect(screen.getByText("Photo policies")).toBeTruthy();
    expect(screen.getByText("No watermark")).toBeTruthy();
    expect(screen.getByText("No logo")).toBeTruthy();
    expect(screen.getByText("No shop branding")).toBeTruthy();
    expect(screen.getByText(/GRIDGO looks at every sample/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: PHOTO_POLICY_CONFIRM })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Not now" })).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: PHOTO_POLICY_CONFIRM }));
    await expect(pending).resolves.toBe("confirmed");
    expect(router.back).toHaveBeenCalled();
  });

  it("offers the photos, not a dead end, before Place on Board", async () => {
    const pending = askPhotoPolicy({ moment: "submit" });
    await render(<PhotoPolicySheet />);

    await fireEvent.press(screen.getByRole("button", { name: "Check my photos" }));
    await expect(pending).resolves.toBe("check_photos");
  });

  it("treats leaving the sheet as a decline", async () => {
    const pending = askPhotoPolicy({ moment: "submit" });
    const view = await render(<PhotoPolicySheet />);
    await view.unmount();
    await expect(pending).resolves.toBe("declined");
  });
});

describe("Sample photos — photo policies at the photo step", () => {
  it("opens the library only after the shop confirms, and asks once", async () => {
    await render(<SamplePhotosScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Choose a photo" }));
    await waitFor(() => expect(useSheets.getState().photoPolicy?.request.moment).toBe("photos"));
    expect(mockUploads.pickImage).not.toHaveBeenCalled();

    await act(async () => settlePhotoPolicy("confirmed"));
    await waitFor(() => expect(mockUploads.pickImage).toHaveBeenCalledTimes(1));

    (router.push as jest.Mock).mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Take a photo" }));
    await waitFor(() => expect(mockUploads.takePhoto).toHaveBeenCalledTimes(1));
    expect(router.push).not.toHaveBeenCalledWith("/shop/photo-policy");
  });

  it("opens nothing when the shop backs out", async () => {
    await render(<SamplePhotosScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Take a photo" }));
    await waitFor(() => expect(useSheets.getState().photoPolicy?.settled).toBe(false));
    await act(async () => settlePhotoPolicy("declined"));

    expect(mockUploads.takePhoto).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Take a photo" })).toBeTruthy();
  });

  it("asks again on the next visit for a listing already on the board", async () => {
    mockListing = listingWith({ onTheBoard: true });
    usePhotoPolicy.setState({ confirmed: ["item_1"] });
    const view = await render(<SamplePhotosScreen />);
    await view.unmount();
    expect(usePhotoPolicy.getState().confirmed).toEqual([]);
  });

  it("keeps a hidden listing's confirmation for its submission", async () => {
    usePhotoPolicy.setState({ confirmed: ["item_1"] });
    const view = await render(<SamplePhotosScreen />);
    await view.unmount();
    expect(usePhotoPolicy.getState().confirmed).toEqual(["item_1"]);
  });
});
