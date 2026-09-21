import { type RepeatingCallOptions, startRepeatingCall } from "./repeatingCall.ts";

// Drains `review_deliveries`: the answer of a question ticket, and the
// review a person sent back, reach the terminal of the agent that waits for
// each of them.
export const startReviewDeliveryLoop = (options: RepeatingCallOptions) =>
	startRepeatingCall({ ...options, failureLogMessage: "review delivery failed" });
