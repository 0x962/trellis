import { expect, test } from "bun:test";
import { domainQueue } from "./domainQueue";

test("a committed execution waits behind recovery and repeated queued notices coalesce", async () => {
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const calls: string[] = [];
	const queue = domainQueue("admission", {
		recover: async () => { calls.push("recover"); entered.resolve(); await release.promise; },
		committed: async ({ executionId }) => { calls.push(executionId); },
	}, () => {});
	const recovering = queue.recover();
	await entered.promise;
	const first = queue.committed("one");
	const replay = queue.committed("one");
	const second = queue.committed("two");
	expect(calls).toEqual(["recover"]);
	release.resolve();
	await Promise.all([recovering, first, replay, second]);
	expect(calls).toEqual(["recover", "one", "two"]);
	await queue.stop();
});

test("a failed domain call logs the failure and leaves later retained work callable", async () => {
	const logs: unknown[] = [];
	const calls: string[] = [];
	const queue = domainQueue("decisions", {
		recover: async () => { calls.push("recover"); },
		committed: async () => { throw new Error("remote_outcome_unknown"); },
	}, (message, fields) => logs.push({ message, fields }));
	await queue.committed("one");
	await queue.recover();
	expect(logs).toEqual([{
		message: "Langflow domain work failed",
		fields: { domain: "decisions", work: "execution:one", error: "remote_outcome_unknown" },
	}]);
	expect(calls).toEqual(["recover"]);
	await queue.stop();
});

test("stop awaits the active effect and leaves queued obligations for the next host", async () => {
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const calls: string[] = [];
	const queue = domainQueue("native", {
		recover: async () => { calls.push("recover"); },
		committed: async ({ executionId }) => {
			calls.push(executionId);
			entered.resolve();
			await release.promise;
		},
	}, () => {});
	const active = queue.committed("active");
	await entered.promise;
	const queued = queue.committed("queued");
	let stopped = false;
	const closing = queue.stop().then(() => { stopped = true; });
	await queue.committed("after-stop");
	expect(stopped).toBe(false);
	release.resolve();
	await Promise.all([active, queued, closing]);
	expect(stopped).toBe(true);
	expect(calls).toEqual(["active"]);
});

test("pause retains queued notices until resume", async () => {
	const calls: string[] = [];
	const queue = domainQueue("projection", {
		recover: async () => { calls.push("recover"); },
		committed: async ({ executionId }) => { calls.push(executionId); },
	}, () => {});
	await queue.pause();
	await queue.committed("one");
	await queue.committed("one");
	await queue.recover();
	expect(calls).toEqual([]);
	queue.resume();
	await queue.committed("two");
	expect(calls).toEqual(["one", "recover", "two"]);
	await queue.stop();
});
