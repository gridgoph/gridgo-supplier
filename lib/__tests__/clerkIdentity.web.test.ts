jest.mock("@/lib/webFilePick", () => ({
  canPickOnWeb: () => true,
  pickFileOnWeb: jest.fn(),
}));

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
}));

import { pickFileOnWeb } from "@/lib/webFilePick";
import { changeShopPortrait } from "@/lib/clerkIdentity";

describe("changeShopPortrait on web", () => {
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
