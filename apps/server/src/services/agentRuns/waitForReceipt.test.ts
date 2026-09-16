import { expect, test } from "bun:test";
import { unconfirmedDelivery } from "../deliveries/sentences.ts";
import { waitForReceipt } from "./waitForReceipt.ts";

test("receipt waits stop at their deadline and report an unconfirmed message", async () => {
	await expect(
		waitForReceipt(
			{
				subscribeSession: async function* (_id, signal) {
					await new Promise<void>((_resolve, reject) =>
						signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
					);
					yield* [];
				},
			},
			"attempt",
			"message",
			5,
		),
	).rejects.toThrow(unconfirmedDelivery);
});
