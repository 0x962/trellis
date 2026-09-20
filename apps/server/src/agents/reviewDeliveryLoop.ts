import { type DeliveryLoopOptions, startDeliveryLoop } from "./deliveryLoop.ts";

// Drains `review_deliveries`: the answer of a question ticket reaches the
// terminal of every agent that waits for that answer.
export const startReviewDeliveryLoop = (options: DeliveryLoopOptions) =>
	startDeliveryLoop({ ...options, failureText: "review delivery failed" });
