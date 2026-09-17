import { expect, test } from "bun:test";
import { unconfirmedDelivery } from "../deliveries/sentences.ts";
import { sendDeadline } from "./sendDeadline.ts";

test("a transport timeout has an unknown outcome even if the send later completes", async () => {
	let finish!: () => void;
	const sent = new Promise<void>((resolve) => {
		finish = resolve;
	});
	await expect(sendDeadline(sent, 5)).rejects.toThrow(unconfirmedDelivery);
	finish();
	await sent;
});

test("the transport result settles the send before its deadline", async () => {
	await expect(sendDeadline(Promise.resolve(), 5)).resolves.toBeUndefined();
	await expect(sendDeadline(Promise.reject(new Error("disconnected")), 5)).rejects.toThrow("disconnected");
});
