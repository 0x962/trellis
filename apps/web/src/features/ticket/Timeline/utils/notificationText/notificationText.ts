import type { CommentNotification } from "@trellis/api";

export const notificationText = ({ state, error }: Pick<CommentNotification, "state" | "error">) => {
	if (state === "sent") return "Notified";
	if (state === "failed") return `Not delivered. ${error ?? "The assignment closed or changed."}`;
	if (state === "unknown") return "Delivery uncertain. Check the agent before another mention.";
	return "Queued";
};
