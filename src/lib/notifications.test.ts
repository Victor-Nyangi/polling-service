import { describe, expect, it } from "vitest";
import { renderNotification } from "@/lib/notifications";

describe("renderNotification", () => {
  it("renders a vote with the actor, option, and question", () => {
    expect(
      renderNotification("poll_vote", {
        actor_username: "ada",
        option_label: "Rust",
        question: "Best language?",
      }),
    ).toEqual({
      title: "New vote on your poll",
      body: '@ada voted "Rust" on "Best language?".',
    });
  });

  it("falls back to placeholders when vote payload fields are absent", () => {
    expect(renderNotification("poll_vote", {})).toEqual({
      title: "New vote on your poll",
      body: 'Someone voted "an option" on "your poll".',
    });
  });

  it("renders a response milestone with the count and question", () => {
    expect(
      renderNotification("poll_responses", {
        count: 10,
        question: "Best language?",
      }),
    ).toEqual({
      title: "New responses to your poll",
      body: '10 people have responded to "Best language?".',
    });
  });

  it("uses the singular for the first response", () => {
    expect(
      renderNotification("poll_responses", {
        count: 1,
        question: "Best language?",
      }).body,
    ).toBe('1 person has responded to "Best language?".');
  });

  it("falls back to placeholders when milestone payload fields are absent", () => {
    expect(renderNotification("poll_responses", {}).body).toBe(
      'People have responded to "your poll".',
    );
  });

  // payload->>'count' is the dedupe key in the database, but the payload
  // itself is still untyped JSON by the time it reaches the renderer.
  it("drops a count that is not a positive integer", () => {
    for (const count of ["10", 0, -5, 2.5, Number.NaN, null]) {
      expect(
        renderNotification("poll_responses", { count, question: "Q?" }).body,
      ).toBe('People have responded to "Q?".');
    }
  });

  it("renders a reviewed report, defaulting the status to reviewed", () => {
    expect(renderNotification("report_reviewed", { status: "closed" }).body).toBe(
      "A moderator marked your report as closed.",
    );
    expect(renderNotification("report_reviewed", {}).body).toBe(
      "A moderator marked your report as reviewed.",
    );
  });

  it("degrades gracefully for an unrecognised notification type", () => {
    expect(renderNotification("future_type", {})).toEqual({
      title: "future_type",
      body: "New platform activity",
    });
  });

  // The payload arrives as untyped JSON from the database, so non-string
  // values must not leak into the rendered copy.
  it("ignores non-string payload values", () => {
    expect(
      renderNotification("poll_vote", {
        actor_username: 42,
        option_label: null,
        question: { nested: true },
      }).body,
    ).toBe('Someone voted "an option" on "your poll".');
  });

  it("treats an empty actor username as anonymous", () => {
    expect(
      renderNotification("poll_vote", {
        actor_username: "",
        option_label: "Yes",
        question: "Q?",
      }).body,
    ).toBe('Someone voted "Yes" on "Q?".');
  });
});
