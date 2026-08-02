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
