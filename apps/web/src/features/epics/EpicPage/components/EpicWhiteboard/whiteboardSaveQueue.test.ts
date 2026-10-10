import { expect, test } from "bun:test";
import { whiteboardDraft } from "./whiteboardDraft";
import { whiteboardSaveQueue } from "./whiteboardSaveQueue";

const deferred = <T>() => {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
};

test("save serializes edits and uses the last accepted revision", async () => {
	const first = deferred<{ revision: number }>();
	const calls: { snapshot: object; revision: number }[] = [];
	const queue = whiteboardSaveQueue({
		revision: 4,
		onState: () => {},
		save: async (snapshot, revision) => {
			calls.push({ snapshot, revision });
			return calls.length === 1 ? first.promise : { revision: 6 };
		},
	});
	queue.change({ stroke: 1 });
	const saving = queue.flush();
	queue.change({ stroke: 2 });
	queue.change({ stroke: 3 });
	await queue.flush();
	expect(calls).toEqual([{ snapshot: { stroke: 1 }, revision: 4 }]);
	first.resolve({ revision: 5 });
	await saving;
	await Promise.resolve();
	expect(calls).toEqual([
		{ snapshot: { stroke: 1 }, revision: 4 },
		{ snapshot: { stroke: 3 }, revision: 5 },
	]);
	expect(queue.getRevision()).toBe(6);
});

test("a refused save preserves the draft and prevents a later overwrite", async () => {
	const failure = new Error("The host has a newer revision.");
	const states: string[] = [];
	let calls = 0;
	const queue = whiteboardSaveQueue({
		revision: 2,
		onState: (state) => states.push(state.status),
		save: async () => {
			calls += 1;
			throw failure;
		},
	});
	queue.change({ stroke: 1 });
	await queue.flush();
	queue.change({ stroke: 2 });
	await queue.flush();
	expect(calls).toBe(1);
	expect(states.at(-1)).toBe("error");
	expect(queue.getRevision()).toBe(2);
});

test("route remount retains the final stroke and in-flight save revision", async () => {
	const first = deferred<{ revision: number }>();
	const scope = {};
	const calls: { snapshot: object; revision: number }[] = [];
	const save = async (snapshot: object, revision: number) => {
		calls.push({ snapshot, revision });
		return calls.length === 1 ? first.promise : { revision: 2 };
	};
	const draft = whiteboardDraft(scope, "epic", { snapshot: null, revision: 0 }, save);
	const close = draft.subscribe(() => {});
	draft.change({ stroke: 1 });
	close();
	const remounted = whiteboardDraft(scope, "epic", { snapshot: null, revision: 0 }, save);
	const leave = remounted.subscribe(() => {});
	expect(remounted).toBe(draft);
	expect(remounted.snapshot).toEqual({ stroke: 1 });
	remounted.change({ stroke: 2 });
	first.resolve({ revision: 1 });
	await first.promise;
	await Promise.resolve();
	await Promise.resolve();
	leave();
	await Promise.resolve();
	expect(calls).toEqual([
		{ snapshot: { stroke: 1 }, revision: 0 },
		{ snapshot: { stroke: 2 }, revision: 1 },
	]);
});

test("effect replay retains the shared draft and protects unload after route exit", async () => {
	const request = deferred<{ revision: number }>();
	const scope = {};
	const initial = { snapshot: null, revision: 0 };
	const blocked: boolean[] = [];
	const save = () => request.promise;
	const draft = whiteboardDraft(scope, "epic", initial, save, (value) => blocked.push(value));
	const firstEffect = draft.subscribe(() => {});
	firstEffect();
	const secondEffect = draft.subscribe(() => {});
	draft.change({ stroke: 1 });
	secondEffect();
	expect(blocked.at(-1)).toBe(true);
	const remounted = whiteboardDraft(scope, "epic", initial, save);
	expect(remounted).toBe(draft);
	expect(remounted.snapshot).toEqual({ stroke: 1 });
	request.resolve({ revision: 1 });
	await request.promise;
	await Promise.resolve();
	expect(blocked.at(-1)).toBe(false);
});

test("a failed detached draft protects unload until explicit discard", async () => {
	const blocked: boolean[] = [];
	const request = deferred<{ revision: number }>();
	const draft = whiteboardDraft(
		{},
		"epic",
		{ snapshot: null, revision: 0 },
		() => request.promise,
		(value) => blocked.push(value),
	);
	const leave = draft.subscribe(() => {});
	draft.change({ stroke: 1 });
	leave();
	request.reject(new Error("The host has a newer revision."));
	await Promise.resolve();
	await Promise.resolve();
	expect(draft.state.status).toBe("error");
	expect(blocked.at(-1)).toBe(true);
	draft.discard();
	expect(blocked.at(-1)).toBe(false);
});
