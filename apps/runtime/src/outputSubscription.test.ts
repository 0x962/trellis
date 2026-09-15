import { expect, test } from "bun:test";
import type { RuntimeOutputEvent, RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { outputSubscription } from "./outputSubscription.ts";

const fixture = () => {
	let bytes = Buffer.from("replay");
	let listener: (() => void) | undefined;
	let status: RuntimeProcessStatus["status"] = "running";
	let complete = false;
	const store = {
		subscribe: (_id: string, notify: () => void) => {
			listener = notify;
			return () => {
				listener = undefined;
			};
		},
		output: (_id: string, offset: number) => ({
			data: bytes.subarray(offset).toString("base64"),
			startOffset: offset,
			nextOffset: bytes.length,
			truncated: false,
		}),
		outputComplete: () => complete,
		inspect: () => ({ id: "attempt", status, mode: "pty" }) as RuntimeProcessStatus,
	};
	return {
		store,
		append(text: string) {
			bytes = Buffer.concat([bytes, Buffer.from(text)]);
			listener?.();
		},
		uncertain() {
			status = "unknown";
			listener?.();
		},
		exit() {
			complete = true;
			status = "exited";
			listener?.();
		},
		count: () => Number(listener !== undefined),
	};
};

test("replay and live output remain contiguous while a slow write overlaps process exit", async () => {
	const f = fixture();
	const events: RuntimeOutputEvent[] = [];
	await outputSubscription(
		f.store,
		{ id: "attempt", offset: 0 },
		async (event) => {
			events.push(event);
			if (event.type === "output" && event.startOffset === 0) {
				await Promise.resolve();
				f.append("live");
				f.exit();
			}
		},
		new AbortController().signal,
	);
	const output = events.filter((event) => event.type === "output");
	expect(output.map((event) => [event.startOffset, event.nextOffset])).toEqual([
		[0, 6],
		[6, 10],
	]);
	expect(output.map((event) => Buffer.from(event.data, "base64").toString()).join("")).toBe("replaylive");
	expect(events.at(-1)).toMatchObject({ type: "session", session: { status: "exited" } });
	expect(f.count()).toBe(0);
});

test("reconnect starts at the rendered byte offset and releases the subscription on cancel", async () => {
	const f = fixture();
	const controller = new AbortController();
	const events: RuntimeOutputEvent[] = [];
	const pending = outputSubscription(
		f.store,
		{ id: "attempt", offset: 3 },
		async (event) => {
			events.push(event);
			if (event.type === "output") controller.abort();
		},
		controller.signal,
	);
	await expect(pending).rejects.toThrow();
	expect(events.filter((event) => event.type === "output")).toEqual([
		{ type: "output", data: Buffer.from("lay").toString("base64"), startOffset: 3, nextOffset: 6, truncated: false },
	]);
	expect(f.count()).toBe(0);
});

test("temporary unknown process status waits for the final output before stream completion", async () => {
	const f = fixture();
	const output: string[] = [];
	let finish: (() => void) | undefined;
	const task = outputSubscription(
		f.store,
		{ id: "attempt", offset: 0 },
		async (event) => {
			if (event.type === "output") {
				output.push(Buffer.from(event.data, "base64").toString());
				if (event.startOffset === 0) f.uncertain();
			} else if (event.session.status === "unknown") {
				finish = () => {
					f.append("final");
					f.exit();
				};
			}
		},
		new AbortController().signal,
	);
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
	finish!();
	await task;
	expect(output.join("")).toBe("replayfinal");
	expect(f.count()).toBe(0);
});
