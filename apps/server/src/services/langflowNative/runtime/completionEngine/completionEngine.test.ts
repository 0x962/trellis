import { expect, test } from "bun:test";
import { completionFixture } from "../fixture";
import { deliverNativeCompletion } from "./completionEngine";

test("recovers accepted bytes after a lost completion response without another mutation", async () => {
	const f = completionFixture();
	let accepted = false;
	let posts = 0;
	const client = f.client(async (url, options) => {
		const body = JSON.parse(String(options?.body));
		expect(new Headers(options?.headers).get("X-Trellis-Capability-Id")).toBe(f.delivery.authority.capabilityId);
		expect(body.authorityBytes).toBe(f.authorityBytes);
		if (String(url).endsWith("/visit")) {
			expect(body.requestBytes).toBe(f.delivery.requestBytes);
			return Response.json(f.visit);
		}
		if (String(url).endsWith("/lookup")) return Response.json(f.lookup(accepted));
		expect(body.resultBytes).toBe(f.delivery.resultBytes);
		expect(body.deliveryBytes).toBe(f.delivery.deliveryBytes);
		expect(body.engineWaitId).toBe(f.visit.engineWaitId);
		posts += 1;
		accepted = true;
		throw new Error("connection_lost_after_acceptance");
	});
	const input = { client, delivery: f.delivery, authorityBytes: f.authorityBytes,
		signal: new AbortController().signal, current: async () => f.delivery };
	const first = await deliverNativeCompletion(input);
	expect(first).toEqual({ state: "accepted", receipt: f.receipt, waitBytes: f.waitBytes });
	expect(await deliverNativeCompletion(input)).toEqual(first);
	expect(posts).toBe(1);
	expect(f.result.launchBinding.engineEpoch).toBe(1);
	expect(f.delivery.authority.engineEpoch).toBe(2);
});

test("keeps unknown lookup pending without completion submission", async () => {
	const f = completionFixture();
	const paths: string[] = [];
	const client = f.client(async (url) => {
		paths.push(String(url));
		if (String(url).endsWith("/visit")) return Response.json(f.visit);
		throw new Error("lookup_unreachable");
	});
	expect(await deliverNativeCompletion({ client, delivery: f.delivery, authorityBytes: f.authorityBytes,
		signal: new AbortController().signal, current: async () => f.delivery })).toEqual({ state: "pending", reason: "lookup_unknown" });
	expect(paths.some((path) => path.endsWith("/completions"))).toBe(false);
});

test("retains one unresolved submission when recovery still reports waiting", async () => {
	const f = completionFixture();
	let posts = 0;
	let lookups = 0;
	const client = f.client(async (url) => {
		if (String(url).endsWith("/visit")) return Response.json(f.visit);
		if (String(url).endsWith("/lookup")) { lookups += 1; return Response.json(f.lookup(false)); }
		posts += 1;
		throw new Error("completion_unknown");
	});
	expect(await deliverNativeCompletion({ client, delivery: f.delivery, authorityBytes: f.authorityBytes,
		signal: new AbortController().signal, current: async () => f.delivery })).toEqual({ state: "pending", reason: "completion_unknown" });
	expect(posts).toBe(1);
	expect(lookups).toBe(2);
});

test("does not submit after cancellation withdraws the local delivery", async () => {
	const f = completionFixture();
	let posts = 0;
	const client = f.client(async (url) => {
		if (String(url).endsWith("/visit")) return Response.json(f.visit);
		if (String(url).endsWith("/lookup")) return Response.json(f.lookup(false));
		posts += 1;
		return Response.json(f.receipt);
	});
	expect(await deliverNativeCompletion({ client, delivery: f.delivery, authorityBytes: f.authorityBytes,
		signal: new AbortController().signal, current: async () => null })).toEqual({ state: "pending", reason: "delivery_withdrawn" });
	expect(posts).toBe(0);
});

test("refuses an engine receipt for another wait or changed result bytes", async () => {
	for (const change of ["wait", "result"]) {
		const f = completionFixture();
		const client = f.client(async (url) => {
			if (String(url).endsWith("/visit")) return Response.json(f.visit);
			const lookup = f.lookup(true);
			return Response.json(change === "wait"
				? { ...lookup, engineWaitId: "other-wait" }
				: { ...lookup, resultBytes: `${f.delivery.resultBytes} ` });
		});
		await expect(deliverNativeCompletion({ client, delivery: f.delivery, authorityBytes: f.authorityBytes,
			signal: new AbortController().signal, current: async () => f.delivery })).rejects.toThrow("native_completion_lookup_conflict");
	}
});

test("keeps a reservation wait pending until the engine retains the native handle", async () => {
	const f = completionFixture();
	const client = f.client(async () => Response.json({ ...f.visit,
		waitBytes: JSON.stringify({ kind: "native_reservation", waitId: f.visit.engineWaitId, request: JSON.parse(f.delivery.requestBytes) }) }));
	expect(await deliverNativeCompletion({ client, delivery: f.delivery, authorityBytes: f.authorityBytes,
		signal: new AbortController().signal, current: async () => f.delivery })).toEqual({ state: "pending", reason: "reservation_wait" });
});
