/**
 * GRIDGO's published product catalogue — four categories, seventeen services.
 *
 * This is a transcription of the captain's "Product Category Mapping & Chart",
 * kept here so the app can still render the catalogue while the platform is
 * publishing it. `lib/taxonomy.ts` prefers whatever `GET /taxonomy` serves and
 * only reaches for this when the live vocabulary has no service level yet.
 *
 * The chart itself is a black-on-yellow presentation piece. Only its structure
 * and its words are used here; the styling is not.
 */

export type PublishedService = {
  /** Stable code. Also the code sent to the platform once it publishes these. */
  code: string;
  name: string;
  /** The examples line from the chart, verbatim. */
  examples: string;
};

export type PublishedCategory = {
  code: string;
  name: string;
  /** The "best for" line from the chart, verbatim. */
  audience: string;
  services: PublishedService[];
};

/**
 * Codes match the ones the platform publishes (`gridgo-api`
 * `docs/TAXONOMY_API.md` §3), so a build that starts on this fallback and later
 * reaches a migrated platform is talking about the same categories.
 */
export const PUBLISHED_CATALOG: PublishedCategory[] = [
  {
    code: "marketing_collateral",
    name: "Marketing & promotional collateral",
    audience:
      "Businesses, startups, and events promoting services or handing out physical marketing material.",
    services: [
      {
        code: "flyers",
        name: "Flyers",
        examples: "Single sheets, event promos, product announcements",
      },
      {
        code: "brochures",
        name: "Brochures",
        examples: "Bi-fold, tri-fold, company profiles",
      },
      {
        code: "posters_standees",
        name: "Posters & standees",
        examples: "Indoor event posters, pull-up banners, x-stands",
      },
      {
        code: "business_cards",
        name: "Business cards",
        examples: "Standard, matte, glossy, textured, QR-code enabled",
      },
      {
        code: "stickers_packaging_labels",
        name: "Stickers & packaging labels",
        examples: "Die-cut product labels, vinyl stickers, sheet stickers",
      },
      {
        code: "tarpaulins_outdoor_banners",
        name: "Tarpaulins & outdoor banners",
        examples: "Event banners, billboards, temporary roadside signs",
      },
    ],
  },
  {
    code: "corporate_event_merch",
    name: "Corporate & event merchandise",
    audience: "Student orgs, HR teams, event organizers, and corporate branding.",
    services: [
      {
        code: "lanyards_id_accessories",
        name: "Lanyards & ID accessories",
        examples: "Sublimation lanyards, custom ID laces, badge holders",
      },
      {
        code: "custom_apparel",
        name: "Custom apparel",
        examples: "T-shirts, hoodies, polo shirts, tote bags",
      },
      {
        code: "drinkware",
        name: "Drinkware",
        examples: "Sublimation mugs, laser-engraved tumblers, water bottles",
      },
      {
        code: "corporate_giveaways",
        name: "Corporate giveaways",
        examples: "Eco-bags, umbrellas, customized pens, keychains, notebooks",
      },
    ],
  },
  {
    code: "recognition_awards_signage",
    name: "Recognition, awards & signage",
    audience:
      "Competitions, graduations, guest speakers, store branding, and office spaces.",
    services: [
      {
        code: "certificates_diplomas",
        name: "Certificates & diplomas",
        examples: "Specialty paper, foil-stamped, embossed",
      },
      {
        code: "plaques_trophies",
        name: "Plaques & trophies",
        examples: "Custom acrylic cut, wooden plaques, 3D-printed awards",
      },
      {
        code: "medals_ribbons",
        name: "Medals & ribbons",
        examples: "Metal or acrylic medals with custom sublimation ribbons",
      },
      {
        code: "business_store_signages",
        name: "Business & store signages",
        examples: "Acrylic build-up letters, Panaflex lightboxes, LED neon flex",
      },
    ],
  },
  {
    code: "specialized_prototyping",
    name: "Specialized & prototyping services",
    audience:
      "Architecture students, engineers, industrial designers, and specialized builds.",
    services: [
      {
        code: "three_d_printing_scale_models",
        name: "3D printing & scale models",
        examples: "Rapid prototyping, architectural scale models, custom parts",
      },
      {
        code: "blueprint_cad_plotting",
        name: "Blueprint & CAD plotting",
        examples: "Large-format architectural and engineering plans",
      },
      {
        code: "packaging_box_production",
        name: "Packaging & box production",
        examples: "Custom product boxes, mailer boxes, food-grade packaging",
      },
    ],
  },
];

/**
 * Where each published category sits in the platform's older, coarser
 * vocabulary (`large_format`, `offset`, `apparel_sublimation`, `signage`).
 *
 * The platform retires those codes into `categoryAliases` when it publishes the
 * catalogue, and this table stops being read the moment it does. It exists only
 * so a build pointed at a platform that has not migrated yet can still file a
 * declaration against something real instead of failing.
 *
 * The two vocabularies cross-cut — the old codes describe production
 * capability, the chart describes audience — so each mapping here is the
 * dominant home only. `gridgo-api`'s `docs/TAXONOMY_API.md` §4 is authoritative.
 */
export const LEGACY_CODE_FOR_CATEGORY: Record<string, string> = {
  marketing_collateral: "offset",
  corporate_event_merch: "apparel_sublimation",
  recognition_awards_signage: "signage",
  // Nothing in the pre-chart vocabulary reaches prototyping work, so on an
  // un-migrated platform this category cannot be filed against at all — the
  // screen says so rather than offering a control that would be rejected.
};
