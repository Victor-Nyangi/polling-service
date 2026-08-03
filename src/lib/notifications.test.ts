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

  it("distinguishes likes from dislikes", () => {
    expect(
      renderNotification("post_reaction", {
        actor_username: "ada",
        reaction_type: "like",
      }).body,
    ).toBe("@ada liked your post.");

    expect(
      renderNotification("post_reaction", {
        actor_username: "ada",
        reaction_type: "dislike",
      }).body,
    ).toBe("@ada disliked your post.");
  });

  it("treats an unknown reaction type as a like", () => {
    expect(renderNotification("post_reaction", {}).body).toBe(
      "Someone liked your post.",
    );
  });

  it("renders a repost", () => {
    expect(
      renderNotification("post_repost", { actor_username: "ada" }),
    ).toEqual({
      title: "Your post was reposted",
      body: "@ada reposted your post.",
    });
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
      renderNotification("post_repost", { actor_username: "" }).body,
    ).toBe("Someone reposted your post.");
  });
});
