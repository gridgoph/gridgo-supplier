import type { ImageSourcePropType } from "react-native";

import type { OnboardingArt } from "@/data/onboarding";

/**
 * Raster images, required in one place.
 *
 * Screens and components take `images.*` from here — they do not `require`
 * an asset themselves. Metro wants a static `require` of a string literal,
 * so each file is named here, not discovered.
 */
export const images = {
  onboarding: {
    invoices: require("../assets/images/onboarding/invoices.png"),
    checklist: require("../assets/images/onboarding/checklist.png"),
    payment: require("../assets/images/onboarding/payment.png"),
  } satisfies Record<OnboardingArt, number>,
  /**
   * Example print samples for GRIDGO starters. Keyed by starter id. The picker
   * shows this photo, and creating from that starter copies it onto the
   * listing as the first sample.
   */
  starters: {
    lst_tarpaulins_outdoor_banners: require("../assets/images/starters/lst_tarpaulins_outdoor_banners.jpg"),
    lst_flyers: require("../assets/images/starters/lst_flyers.jpg"),
    lst_brochures: require("../assets/images/starters/lst_brochures.jpg"),
    lst_business_cards: require("../assets/images/starters/lst_business_cards.jpg"),
    lst_posters_standees: require("../assets/images/starters/lst_posters_standees.jpg"),
    lst_stickers_packaging_labels: require("../assets/images/starters/lst_stickers_packaging_labels.jpg"),
    lst_custom_apparel: require("../assets/images/starters/lst_custom_apparel.jpg"),
    lst_lanyards_id_accessories: require("../assets/images/starters/lst_lanyards_id_accessories.jpg"),
    lst_drinkware: require("../assets/images/starters/lst_drinkware.jpg"),
    lst_corporate_giveaways: require("../assets/images/starters/lst_corporate_giveaways.jpg"),
    lst_certificates_diplomas: require("../assets/images/starters/lst_certificates_diplomas.jpg"),
    lst_plaques_trophies: require("../assets/images/starters/lst_plaques_trophies.jpg"),
    lst_medals_ribbons: require("../assets/images/starters/lst_medals_ribbons.jpg"),
    lst_three_d_printing_scale_models: require("../assets/images/starters/lst_three_d_printing_scale_models.jpg"),
    lst_blueprint_cad_plotting: require("../assets/images/starters/lst_blueprint_cad_plotting.jpg"),
  } satisfies Record<string, number>,
};

/** The example sample for one GRIDGO starter, if this app shipped one. */
export function starterImage(id: string): ImageSourcePropType | undefined {
  return images.starters[id as keyof typeof images.starters];
}
