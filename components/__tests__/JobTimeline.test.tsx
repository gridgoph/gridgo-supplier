import { render, screen } from "@testing-library/react-native";

import { JobTimeline } from "@/components/JobTimeline";

// GRIDGO's supplier timeline is `{at, state, note}`: who moved the job is not
// sent, and an unnamed row must not read as GRIDGO's move.
it("renders a timeline entry without an actor, naming nobody", async () => {
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

  expect(screen.queryByText(/·/)).toBeNull();
  expect(screen.getByText("The order is in production")).toBeTruthy();
});

it("still names the actor when one is sent", async () => {
  await render(
    <JobTimeline
      timeline={[{ at: "2026-10-06T00:00:00Z", state: "production", by: "system", note: "Started" }]}
    />,
  );

  expect(screen.getByText(/· GRIDGO$/)).toBeTruthy();
});
