import { type RepeatingCallOptions, startRepeatingCall } from "./repeatingCall.ts";

// Drains `review_deliveries`: the review a person sent back, a comment on
// the diff, and a change in the GitHub checks reach the terminal of the
// agent that holds the pull request.
export const startReviewDeliveryLoop = (options: RepeatingCallOptions) =>
	startRepeatingCall({ ...options, failureLogMessage: "review delivery failed" });
