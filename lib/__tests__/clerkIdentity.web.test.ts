jest.mock("@/lib/webFilePick", () => ({
  canPickOnWeb: () => true,
  pickFileOnWeb: jest.fn(),
}));

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
}));

import { pickFileOnWeb } from "@/lib/webFilePick";
import { changeShopPortrait, PORTRAIT_FAILED } from "@/lib/clerkIdentity";

describe("changeShopPortrait on web", () => {
  it("never exposes an upload service error", async () => {
    (pickFileOnWeb as jest.Mock).mockResolvedValue({ file: new File(["photo"], "photo.png") });
    const user = { setProfileImage: jest.fn().mockRejectedValue(new Error("ClerkJS: Network error at /v1/me/profile_image")) };
    expect(await changeShopPortrait(user)).toEqual({ status: "failed", message: PORTRAIT_FAILED });
  });

  it("saves a browser-picked picture onto the sign-in", async () => {
    const file = new File(["shop"], "shop.png", { type: "image/png" });
    (pickFileOnWeb as jest.Mock).mockResolvedValue({
      uri: "blob:shop",
      name: "shop.png",
      mimeType: "image/png",
      size: 4,
      file,
    });
    const user = {
      setProfileImage: jest.fn(async () => undefined),
      reload: jest.fn(async () => undefined),
    };

    expect(await changeShopPortrait(user)).toEqual({ status: "ok" });
    expect(user.setProfileImage).toHaveBeenCalledWith({ file });
    expect(user.reload).toHaveBeenCalled();
  });
});
