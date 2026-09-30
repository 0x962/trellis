import { expect, test } from "bun:test";
import type { LiveOwnership } from "../contracts";
import { type HeldEngineScope, withHeldEngine } from "./heldEngine";

function fixture() {
	const observation: LiveOwnership = {
		id: "observation",
		identity: {
			hostId: "host",
			dataHomeId: "home",
			ownerId: "owner",
			instanceId: "instance",
			manifestDigest: "a".repeat(64),
		},
		observedAt: "2026-09-29T00:00:00.000Z",
		endpoint: "http://127.0.0.1:7860",
	};
	const state = { held: false, entries: 0 };
	const supervisor: HeldEngineScope["supervisor"] = {
		async withHealthyEngine<T>(action: (current: LiveOwnership) => Promise<T>) {
			if (state.held) throw new Error("unexpected_nested_scope");
			state.held = true;
			state.entries += 1;
			try {
				return await action(observation);
			} finally {
				state.held = false;
			}
		},
	};
	return { observation, state, supervisor };
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("nested engine operations share one real hold and exact observation", async () => {
	const f = fixture();
	await withHeldEngine(f.supervisor, async ({ supervisor, observation }) => {
		expect(observation).toEqual(f.observation);
		await Promise.all(
			[1, 2].map(() => supervisor.withHealthyEngine(async (current) => {
				expect(f.state.held).toBe(true);
				expect(current).toEqual(f.observation);
			})),
		);
	});
	expect(f.state).toEqual({ held: false, entries: 1 });
});

test("an escaped adapter refuses operations after the real hold ends", async () => {
	const f = fixture();
	const held = await withHeldEngine(f.supervisor, async ({ supervisor }) => supervisor);
	let called = false;
	await expect(held.withHealthyEngine(async () => {
		called = true;
	})).rejects.toThrow("held_engine_scope_closed");
	expect(called).toBe(false);
	expect(f.state.held).toBe(false);
});

test("the outer hold awaits entered work after the caller returns", async () => {
	const f = fixture();
	const entered = deferred();
	const finish = deferred();
	let callbackReturned = false;
	const operation = withHeldEngine(f.supervisor, async ({ supervisor }) => {
		void supervisor.withHealthyEngine(async () => {
			entered.resolve();
			await finish.promise;
			expect(f.state.held).toBe(true);
		});
		callbackReturned = true;
	});
	await entered.promise;
	expect(callbackReturned).toBe(true);
	expect(f.state.held).toBe(true);
	finish.resolve();
	await operation;
	expect(f.state.held).toBe(false);
});

test("failure retains the real hold until entered work finishes", async () => {
	const f = fixture();
	const entered = deferred();
	const finish = deferred();
	const failure = new Error("worker_failed");
	const operation = withHeldEngine(f.supervisor, async ({ supervisor }) => {
		void supervisor.withHealthyEngine(async () => {
			entered.resolve();
			await finish.promise;
		});
		throw failure;
	});
	const result = operation.then(() => null, (error: unknown) => error);
	await entered.promise;
	expect(f.state.held).toBe(true);
	finish.resolve();
	expect(await result).toBe(failure);
	expect(f.state.held).toBe(false);
});

test("a callback cannot change the retained identity for later operations", async () => {
	const f = fixture();
	await withHeldEngine(f.supervisor, async ({ supervisor, observation }) => {
		observation.identity.instanceId = "changed";
		await supervisor.withHealthyEngine(async (current) => {
			current.identity.instanceId = "also-changed";
		});
		await supervisor.withHealthyEngine(async (current) => {
			expect(current).toEqual(f.observation);
		});
	});
});

test("a rejected nested operation releases its scope after propagation", async () => {
	const f = fixture();
	await expect(withHeldEngine(f.supervisor, async ({ supervisor }) => {
		await supervisor.withHealthyEngine(async () => {
			throw new Error("request_failed");
		});
	})).rejects.toThrow("request_failed");
	expect(f.state.held).toBe(false);
});
