import { afterAll, afterEach, expect, test } from "bun:test";
import type { AgentRun, AgentRunStartInput } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { submissionKey, useComposerSubmission } from "./useComposerSubmission";

const storage = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
Object.defineProperty(globalThis, "sessionStorage", {
	configurable: true,
	value: {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => storage.set(key, value),
		removeItem: (key: string) => storage.delete(key),
	},
});
afterAll(() => {
	if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
	else Reflect.deleteProperty(globalThis, "sessionStorage");
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
	storage.clear();
});
const input = { project: "PR", title: "One ticket" };
const choice = { preset: "codex" as const, model: null, effort: null, accountId: null };
const run = { id: "run", assigned: true } as AgentRun;
async function mount(overrides: Partial<Parameters<typeof useComposerSubmission>[0]> = {}) {
	let hook!: ReturnType<typeof useComposerSubmission>;
	const creates: unknown[] = [];
	const assignments: AgentRunStartInput[] = [];
	function Probe() {
		hook = useComposerSubmission({
			create: async (data) => {
				creates.push(data);
				return { identifier: "PR-1" };
			},
			upload: async () => true,
			assign: async (data) => {
				assignments.push(data);
				return run;
			},
			onAssigned: () => {},
			...overrides,
		});
		return null;
	}
	const root = createRoot();
	await act(async () => root.render(<Probe />));
	let closed = false;
	const close = async () => {
		if (!closed) {
			closed = true;
			await act(async () => root.unmount());
		}
	};
	cleanups.push(close);
	return {
		state: () => hook,
		creates,
		assignments,
		close,
		submit: async (selected: typeof choice | null = choice) => {
			let result = false;
			await act(async () => {
				result = await hook.submit(input, selected);
			});
			return result;
		},
	};
}

test("create and assign sends one ticket, its saved identifier, and one request identity", async () => {
	const f = await mount();
	expect(await f.submit()).toBe(true);
	expect(f.creates).toEqual([input]);
	expect(f.assignments).toHaveLength(1);
	expect(f.assignments[0]).toMatchObject({
		ticket: "PR-1",
		requestId: expect.any(String),
		harness: { preset: "codex" },
	});
	expect(f.state().receipt?.assignment?.complete).toBe(true);
});

test("an assignment retry after remount keeps the ticket and original request", async () => {
	let original!: AgentRunStartInput;
	const first = await mount({
		assign: async (data) => {
			original = data;
			throw new Error("Response lost");
		},
	});
	expect(await first.submit()).toBe(false);
	expect(first.state().failure?.stage).toBe("assigning");
	await first.close();
	const resumed = await mount();
	expect(await resumed.submit(null)).toBe(true);
	expect(resumed.creates).toHaveLength(0);
	expect(resumed.assignments).toEqual([original]);
});

test("an attachment failure holds assignment and retries on the saved ticket", async () => {
	let uploaded = false;
	const targets: string[] = [];
	const f = await mount({
		upload: async (identifier) => {
			targets.push(identifier);
			return uploaded;
		},
	});
	expect(await f.submit()).toBe(false);
	expect(f.assignments).toHaveLength(0);
	uploaded = true;
	expect(await f.submit()).toBe(true);
	expect(f.creates).toHaveLength(1);
	expect(targets).toEqual(["PR-1", "PR-1"]);
	expect(f.assignments).toHaveLength(1);
});

test("No agent creates and uploads without a start request", async () => {
	const f = await mount();
	expect(await f.submit(null)).toBe(true);
	expect(f.assignments).toHaveLength(0);
});

test("two submits before rendering send one create request", async () => {
	let release!: (ticket: { identifier: string }) => void;
	let count = 0;
	const f = await mount({
		create: async () => {
			count++;
			return new Promise((resolve) => {
				release = resolve;
			});
		},
	});
	let first!: Promise<boolean>;
	await act(async () => {
		first = f.state().submit(input, choice);
		expect(await f.state().submit(input, choice)).toBe(false);
	});
	expect(count).toBe(1);
	expect(f.state().isRunning()).toBe(true);
	await act(async () => {
		release({ identifier: "PR-1" });
		await first;
	});
	expect(f.assignments).toHaveLength(1);
});

test("create failure leaves no assignment and clear removes the stored receipt", async () => {
	const f = await mount({
		create: async () => {
			throw new Error("Rejected title");
		},
	});
	expect(await f.submit()).toBe(false);
	expect(f.state().failure).toEqual({ stage: "creating", detail: "Rejected title" });
	expect(f.state().receipt).toBe(null);
	expect(f.assignments).toHaveLength(0);
	const success = await mount();
	await success.submit();
	expect(sessionStorage.getItem(submissionKey)).not.toBe(null);
	await act(async () => success.state().clear());
	expect(sessionStorage.getItem(submissionKey)).toBe(null);
});
