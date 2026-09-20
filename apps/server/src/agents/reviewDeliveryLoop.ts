import { type RepeatingCallOptions, startRepeatingCall } from "./repeatingCall.ts";

// Drains the answer rows of `review_deliveries`: the answer of a question
// ticket reaches the terminal of every agent that waits for that answer.
export const startReviewDeliveryLoop = (options: RepeatingCallOptions) =>
	startRepeatingCall({ ...options, failureLogMessage: "review delivery failed" });
