import { images, starterImage } from "@/constants/images";

const STARTER_IDS = [
  "lst_tarpaulins_outdoor_banners",
  "lst_flyers",
  "lst_brochures",
  "lst_business_cards",
  "lst_posters_standees",
  "lst_stickers_packaging_labels",
  "lst_custom_apparel",
  "lst_lanyards_id_accessories",
  "lst_drinkware",
  "lst_corporate_giveaways",
  "lst_certificates_diplomas",
  "lst_plaques_trophies",
  "lst_medals_ribbons",
  "lst_three_d_printing_scale_models",
  "lst_blueprint_cad_plotting",
] as const;

describe("starter sample art", () => {
  it("ships an example photo for every GRIDGO starter id", () => {
    for (const id of STARTER_IDS) {
      expect({ id, sample: starterImage(id) }).toEqual({
        id,
        sample: images.starters[id],
      });
    }
  });

  it("does not invent a sample for an unknown starter", () => {
    expect(starterImage("lst_not_a_real_starter")).toBeUndefined();
  });
});
