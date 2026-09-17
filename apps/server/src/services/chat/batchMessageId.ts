import { createHash } from "node:crypto";

// Trellis sends every pending line of one room to one agent as a single
// message, so the input ledger of the agent session holds one identifier for
// the whole group of `chat_deliveries` rows. The identifier comes from the
// row identifiers alone, so `reconcileUnknownDeliveries` rebuilds it later
// from the rows it reads. A group that lost or gained a row produces a
// different identifier, and the runtime then answers that it holds no such
// message, which leaves those rows uncertain instead of confirming them.
export const chatBatchMessageId = (deliveryIds: string[]) =>
	`chat-${createHash("sha256")
		.update([...deliveryIds].sort().join(","))
		.digest("hex")
		.slice(0, 32)}`;
