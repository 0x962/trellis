import { expect, test } from "bun:test";
import { waitForEngineSocket } from "./waitForEngineSocket";

function fixture() {
	let now = 0;
	const deadlines = new Map<symbol, { at: number; expired: () => void }>();
	const watchers = new Map<string, { changed: (name: string | null) => void; closes: number }>();
	const dependencies = {
		watch(directory: string, changed: (name: string | null) => void) {
			const watcher = { changed, closes: 0 };
			watchers.set(directory, watcher);
			return { close: () => watcher.closes++ };
		},
		schedule(expired: () => void, delayMs: number) {
			const id = Symbol();
			deadlines.set(id, { at: now + delayMs, expired });
			return () => {
				deadlines.delete(id);
			};
		},
	};
	return {
		deadlines,
		watchers,
		dependencies,
		advanceTo(time: number) {
			now = time;
			for (const [id, deadline] of deadlines) {
				if (deadline.at > now) continue;
				deadlines.delete(id);
				deadline.expired();
			}
		},
	};
}

test("eight socket waits accept readiness after the former startup cutoff", async () => {
	const clock = fixture();
	const waits = Array.from({ length: 8 }, (_, index) => waitForEngineSocket(`${index}`, clock.dependencies));
	const outcomes: string[] = [];
	const finished = waits.map((wait) =>
		wait.ready.then(
			() => outcomes.push("ready"),
			() => outcomes.push("failed"),
		),
	);
	clock.advanceTo(15_001);
	await Promise.resolve();
	expect(outcomes).toEqual([]);
	for (let index = 0; index < waits.length; index++) {
		clock.advanceTo(20_000 + index * 1_000);
		clock.watchers.get(`${index}`)!.changed("engine.sock");
	}
	await Promise.all(finished);
	expect(outcomes).toEqual(Array(8).fill("ready"));
	expect(clock.deadlines.size).toBe(0);
	expect([...clock.watchers.values()].map((watcher) => watcher.closes)).toEqual(Array(8).fill(1));
});

test("a missing socket fails at the host observation deadline", async () => {
	const clock = fixture();
	const wait = waitForEngineSocket("engine", clock.dependencies);
	let settled = false;
	const finished = wait.ready.catch((error: Error) => {
		settled = true;
		return error.message;
	});
	clock.advanceTo(59_999);
	await Promise.resolve();
	expect(settled).toBe(false);
	clock.advanceTo(60_000);
	expect(await finished).toBe("Codex app-server socket did not appear within 60 seconds");
	expect(clock.watchers.get("engine")!.closes).toBe(1);
	expect(clock.deadlines.size).toBe(0);
});

test("close cancels the deadline and ignores queued socket events", async () => {
	const clock = fixture();
	const wait = waitForEngineSocket("engine", clock.dependencies);
	let settled = false;
	void wait.ready.then(
		() => {
			settled = true;
		},
		() => {
			settled = true;
		},
	);
	clock.watchers.get("engine")!.changed("other.sock");
	clock.watchers.get("engine")!.changed(null);
	wait.close();
	wait.close();
	clock.watchers.get("engine")!.changed("engine.sock");
	clock.advanceTo(60_001);
	await Promise.resolve();
	expect(settled).toBe(false);
	expect(clock.watchers.get("engine")!.closes).toBe(1);
	expect(clock.deadlines.size).toBe(0);
});
