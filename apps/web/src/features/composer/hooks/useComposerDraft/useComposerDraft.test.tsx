import { afterAll, afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type ComposerDraft, draftKey, useComposerDraft } from "./useComposerDraft";

const storage = new Map<string, string>();
const reads: string[] = [];
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
Object.defineProperty(globalThis, "sessionStorage", {
	configurable: true,
	value: {
		getItem: (key: string) => {
			reads.push(key);
			return storage.get(key) ?? null;
		},
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
	reads.length = 0;
});

async function mount(storageKey?: string, initialDraft?: ComposerDraft) {
	let hook!: ReturnType<typeof useComposerDraft>;
	function Probe() {
		hook = useComposerDraft(storageKey, initialDraft);
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
	return { state: () => hook, close };
}

test("a child draft retains its own edits across remount and clear preserves parent bytes", async () => {
	const parentBytes = JSON.stringify({ title: "Parent", description: "Keep this text", project: "PR" });
	storage.set(draftKey, parentBytes);
	const childKey = `${draftKey}:child`;
	const initial = { title: "New parent", description: "", project: "PR" };
	const child = await mount(childKey, initial);
	expect(child.state().draft).toEqual(initial);
	expect(reads).toEqual([childKey]);
	await act(async () => child.state().setDraft((draft) => ({ ...draft, description: "Child text" })));
	expect(storage.get(draftKey)).toBe(parentBytes);
	await child.close();
	const resumed = await mount(childKey, { title: "Ignored", description: "Ignored" });
	expect(resumed.state().draft).toEqual({ ...initial, description: "Child text" });
	expect(reads).toEqual([childKey, childKey]);
	await act(async () => resumed.state().clearDraft());
	expect(storage.has(childKey)).toBe(false);
	expect(storage.get(draftKey)).toBe(parentBytes);
	expect(resumed.state().draft).toEqual({ title: "", description: "" });
});

test("an unscoped draft keeps the default storage key and saved draft takes precedence", async () => {
	const saved = { title: "Saved", description: "Saved text" };
	storage.set(draftKey, JSON.stringify(saved));
	const f = await mount(undefined, { title: "Initial", description: "" });
	expect(f.state().draft).toEqual(saved);
	expect(reads).toEqual([draftKey]);
	await act(async () => f.state().clearDraft());
	expect(storage.has(draftKey)).toBe(false);
});
