import { render, screen } from "@testing-library/react-native";

import { JobTimeline } from "@/components/JobTimeline";

it("renders a timeline entry without an actor", async () => {
  await render(
    <JobTimeline
      timeline={[
        {
          at: "2026-10-06T00:00:00Z",
          state: "production",
          note: "The order is in production",
        },
      ]}
    />,
  );

  expect(screen.getByText(/· GRIDGO$/)).toBeTruthy();
  expect(screen.getByText("The order is in production")).toBeTruthy();
});
