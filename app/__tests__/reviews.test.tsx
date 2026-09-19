import { render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(() => {
      callback();
    }, [callback]);
  },
}));

jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: () => {} }));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getMyReviews: jest.fn(),
}));

import ReviewsScreen from "@/app/reviews";
import { getMyReviews, type MyReviews } from "@/lib/api";
import { standingLine, starWord, whyMatchingWaits } from "@/lib/reviews";

const rated: MyReviews = {
  summary: {
    count: 2,
    quality: 5,
    speed: 3,
    value: 4,
    overall: 4,
    onTime: { count: 2, rate: 0.5 },
    reviewsUntilMatching: 3,
  },
  ranking: {
    position: 2,
    of: 7,
    byCategory: [
      {
        categoryCode: "marketing_collateral",
        categoryName: "Marketing collateral",
        position: 1,
        of: 4,
        count: 2,
        quality: 5,
        speed: 3,
        value: 4,
        overall: 4,
      },
    ],
  },
  reviews: [
    {
      id: "rev_1",
      orderId: "ord_20260901_0001",
      createdAt: "2026-09-02T03:00:00.000Z",
      qualityStars: 5,
      speedStars: 3,
      valueStars: 4,
      comment: "Beautiful print, a day late.",
      categoryCode: "marketing_collateral",
      categoryName: "Marketing collateral",
      subcategoryCode: "flyers",
      subcategoryName: "Flyers",
      itemName: "A5 flyers",
    },
    {
      id: "rev_2",
      orderId: "ord_20260901_0002",
      createdAt: "2026-09-05T03:00:00.000Z",
      qualityStars: 5,
      speedStars: 3,
      valueStars: 4,
      comment: null,
      categoryCode: "marketing_collateral",
      categoryName: "Marketing collateral",
      subcategoryCode: "flyers",
      subcategoryName: "Flyers",
      itemName: "A5 flyers",
    },
  ],
};

describe("the shop's reviews", () => {
  beforeEach(() => jest.mocked(getMyReviews).mockReset());

  it("leads with the number clients gave and the shop's place on GRIDGO", async () => {
    jest.mocked(getMyReviews).mockResolvedValue(rated);
    render(<ReviewsScreen />);

    await waitFor(() => expect(screen.getAllByText("4.0").length).toBeGreaterThan(0));
    expect(screen.getByText("#2")).toBeTruthy();
    expect(screen.getByText("of 7 shops on GRIDGO")).toBeTruthy();
    // Each category the shop was reviewed in has its own standing.
    expect(screen.getByText("Marketing collateral")).toBeTruthy();
    expect(screen.getByText("#1")).toBeTruthy();
  });

  it("shows every rated job with its note, and never who left it", async () => {
    jest.mocked(getMyReviews).mockResolvedValue(rated);
    render(<ReviewsScreen />);

    await waitFor(() => expect(screen.getByText("“Beautiful print, a day late.”")).toBeTruthy());
    expect(screen.getAllByText("A5 flyers")).toHaveLength(2);
    expect(screen.getAllByLabelText("Speed: 3 of 5")).toHaveLength(2);
    expect(screen.queryByText(/client_/)).toBeNull();
  });

  it("says why matching is not yet reading the stars", async () => {
    jest.mocked(getMyReviews).mockResolvedValue(rated);
    render(<ReviewsScreen />);

    await waitFor(() => expect(screen.getByText(whyMatchingWaits(3))).toBeTruthy());
  });

  it("invites the first review rather than showing an empty table", async () => {
    jest.mocked(getMyReviews).mockResolvedValue({
      summary: { count: 0, quality: null, speed: null, value: null, overall: null, onTime: null, reviewsUntilMatching: 5 },
      ranking: { position: null, of: 3, byCategory: [] },
      reviews: [],
    });
    render(<ReviewsScreen />);

    await waitFor(() => expect(screen.getByText("No reviews yet")).toBeTruthy());
  });
});

describe("reading a score back", () => {
  it("uses the client's own words for an average", () => {
    expect(starWord(4.6)).toBe("Excellent");
    expect(starWord(3.4)).toBe("About what they expected");
    expect(starWord(null)).toBe("Not rated yet");
  });

  it("says the standing in one line", () => {
    expect(standingLine({ count: 7, overall: 4.43 }, { position: 2, of: 9 })).toBe(
      "4.4 out of 5 from 7 reviews. Ranked #2 of 9 shops",
    );
    expect(standingLine({ count: 0, overall: null }, { position: null, of: 9 })).toBe("No reviews yet");
  });
});
