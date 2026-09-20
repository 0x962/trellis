import { type DeliveryLoopOptions, startDeliveryLoop } from "./deliveryLoop.ts";

// Drains `comment_deliveries`: a comment that names an agent reaches that
// agent's terminal.
export const startCommentDeliveryLoop = (options: DeliveryLoopOptions) =>
	startDeliveryLoop({ ...options, failureText: "comment delivery failed" });
