import { type RepeatingCallOptions, startRepeatingCall } from "./repeatingCall.ts";

// Drains `review_deliveries`: the review a person sent back reaches the
// terminal of the agent that waits for it.
export const startReviewDeliveryLoop = (options: RepeatingCallOptions) =>
	startRepeatingCall({ ...options, failureLogMessage: "review delivery failed" });
