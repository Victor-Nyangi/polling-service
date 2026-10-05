export function renderNotification(
  type: string,
  payload: Record<string, unknown>,
): { title: string; body: string } {
  const actor =
    typeof payload.actor_username === "string" && payload.actor_username
      ? `@${payload.actor_username}`
      : "Someone";

  switch (type) {
    case "poll_vote": {
      const option =
        typeof payload.option_label === "string"
          ? payload.option_label
          : "an option";
      const question =
        typeof payload.question === "string" ? payload.question : "your poll";

      return {
        title: "New vote on your poll",
        body: `${actor} voted "${option}" on "${question}".`,
      };
    }
    case "poll_responses": {
      // Anonymous ballots have no actor, so the author hears at milestones
      // (1, 5, 10, ...) rather than per vote. `count` is a JSON number from the
      // notify_poll_responses() trigger; anything else gets count-free copy.
      const question =
        typeof payload.question === "string" ? payload.question : "your poll";
      const count = payload.count;

      if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
        return {
          title: "New responses to your poll",
          body: `People have responded to "${question}".`,
        };
      }

      return {
        title: "New responses to your poll",
        body:
          count === 1
            ? `1 person has responded to "${question}".`
            : `${count} people have responded to "${question}".`,
      };
    }
    case "post_reaction": {
      const verb = payload.reaction_type === "dislike" ? "disliked" : "liked";

      return {
        title: "New reaction on your post",
        body: `${actor} ${verb} your post.`,
      };
    }
    case "post_repost":
      return {
        title: "Your post was reposted",
        body: `${actor} reposted your post.`,
      };
    case "report_reviewed": {
      const status = payload.status === "closed" ? "closed" : "reviewed";

      return {
        title: "Your report was reviewed",
        body: `A moderator marked your report as ${status}.`,
      };
    }
    default:
      return { title: type, body: "New platform activity" };
  }
}
