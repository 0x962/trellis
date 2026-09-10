import { expect, test } from "bun:test";

type ProbeMessage = { type: "ready" } | { type: "done"; elapsed: number };

test("a 200 ms worker query keeps main thread interval drift under 50 ms", async () => {
	const worker = new Worker(new URL("../../test/workers/query.ts", import.meta.url).href);
	const messages: ProbeMessage[] = [];
	let notify = () => {};
	worker.onmessage = ({ data }: MessageEvent<ProbeMessage>) => {
		messages.push(data);
		notify();
	};
	const next = async (type: ProbeMessage["type"]) => {
		while (!messages.some((message) => message.type === type)) {
			await new Promise<void>((resolve) => {
				notify = resolve;
			});
		}
		return messages.find((message) => message.type === type)!;
	};

	await next("ready");
	let expected = performance.now() + 10;
	let maxDrift = 0;
	const timer = setInterval(() => {
		const now = performance.now();
		maxDrift = Math.max(maxDrift, now - expected);
		expected = now + 10;
	}, 10);

	worker.postMessage({ type: "run" });
	const done = await next("done");
	clearInterval(timer);
	worker.terminate();

	expect(done.type === "done" ? done.elapsed : 0).toBeGreaterThanOrEqual(190);
	expect(maxDrift).toBeLessThan(50);
});
