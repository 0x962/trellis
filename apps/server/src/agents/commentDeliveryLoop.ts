import { type RepeatingCallOptions, startRepeatingCall } from "./repeatingCall.ts";

// Drains `comment_deliveries`: a comment that names an agent reaches that
// agent's terminal.
export const startCommentDeliveryLoop = (options: RepeatingCallOptions) =>
	startRepeatingCall({ ...options, failureLogMessage: "comment delivery failed" });
