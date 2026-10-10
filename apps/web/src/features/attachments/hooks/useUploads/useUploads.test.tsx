import { afterAll, afterEach, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../lib/appContext";
import { createUploadState } from "./scopedUploadState";
import { type Uploads, useUploads } from "./useUploads";

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

type UploadCall = { id: string; ticket: string; file: File };
async function mount(
	scope?: string,
	upload: (input: UploadCall, options: { signal: AbortSignal }) => Promise<unknown> = async () => ({}),
) {
	let hook!: Uploads;
	const app = {
		client: { attachments: { upload } },
		orpc: { attachments: { list: { queryKey: () => ["attachments"] } } },
		queryClient: new QueryClient(),
		scheduler: { setTimeout },
	} as unknown as AppContext;
	function Probe() {
		hook = useUploads(undefined, false, scope);
		return null;
	}
	const root = createRoot();
	await act(async () =>
		root.render(
			<AppProvider value={app}>
				<Probe />
			</AppProvider>,
		),
	);
	let closed = false;
	const close = async () => {
		if (closed) return;
		closed = true;
		await act(async () => root.unmount());
	};
	cleanups.push(close);
	return { state: () => hook, close };
}
const file = () => new File(["contents"], "notes.txt", { lastModified: 123 });

test("a scoped pending File survives caller unmount and remount", async () => {
	const scope = crypto.randomUUID();
	const first = await mount(scope);
	const selected = file();
	await act(async () => first.state().addFiles([selected]));
	const id = first.state().uploads[0]!.id;
	await first.close();
	const second = await mount(scope);
	expect(second.state().uploads[0]!.file).toBe(selected);
	expect(second.state().uploads[0]!.id).toBe(id);
	expect(second.state().uploads[0]!.status).toBe("pending");
	expect(second.state().missingFiles).toEqual([]);
	await act(async () => second.state().clear());
	expect(storage.has(`${scope}:uploads`)).toBe(false);
});

test("a remounted caller receives completion from its original request", async () => {
	const scope = crypto.randomUUID();
	const pending = Promise.withResolvers<unknown>();
	const first = await mount(scope, () => pending.promise);
	await act(async () => first.state().addFiles([file()]));
	let result!: Promise<boolean>;
	await act(async () => {
		result = first.state().uploadPending("TRL-1");
	});
	await first.close();
	const second = await mount(scope);
	expect(second.state().uploads[0]!.status).toBe("uploading");
	await act(async () => {
		pending.resolve({});
		await result;
	});
	expect(await result).toBe(true);
	expect(second.state().uploads[0]!.status).toBe("complete");
	expect(storage.has(`${scope}:uploads`)).toBe(false);
});

test("a failed file retains its bytes and upload ID for retry after remount", async () => {
	const scope = crypto.randomUUID();
	const first = await mount(scope, async () => {
		throw new Error("offline");
	});
	const selected = file();
	await act(async () => first.state().addFiles([selected]));
	const id = first.state().uploads[0]!.id;
	await act(async () => {
		expect(await first.state().uploadPending("TRL-1")).toBe(false);
	});
	await first.close();
	const calls: UploadCall[] = [];
	const second = await mount(scope, async (input) => {
		calls.push(input);
		return {};
	});
	expect(second.state().uploads[0]!.error).toEqual({ code: "UPLOAD_FAILED" });
	await act(async () => {
		expect(await second.state().retry(id, "TRL-1")).toBe(true);
	});
	expect(calls).toEqual([{ id, ticket: "TRL-1", file: selected }]);
});

test("persisted metadata without File bytes blocks upload success until matching reselection", async () => {
	const scope = crypto.randomUUID();
	const selected = file();
	const required = {
		id: "original-upload",
		name: selected.name,
		size: selected.size,
		lastModified: selected.lastModified,
	};
	storage.set(`${scope}:uploads`, JSON.stringify([required]));
	const restored = createUploadState(scope);
	expect(restored.getSnapshot()).toEqual({ uploads: [], missing: [required] });
	const calls: UploadCall[] = [];
	const f = await mount(scope, async (input) => {
		calls.push(input);
		return {};
	});
	expect(f.state().missingFiles).toEqual(["notes.txt"]);
	await act(async () => {
		expect(await f.state().uploadPending("TRL-1")).toBe(false);
	});
	expect(calls).toEqual([]);
	await act(async () => f.state().addFiles([new File(["different"], "notes.txt", { lastModified: 123 })]));
	expect(f.state().missingFiles).toEqual(["notes.txt"]);
	await act(async () => f.state().addFiles([file()]));
	expect(f.state().missingFiles).toEqual([]);
	expect(f.state().uploads[1]!.id).toBe("original-upload");
	await act(async () => {
		expect(await f.state().uploadPending("TRL-1")).toBe(true);
	});
	expect(calls).toHaveLength(2);
});

test("discard from a remount aborts the original request and clears persisted metadata", async () => {
	const scope = crypto.randomUUID();
	const pending = Promise.withResolvers<unknown>();
	let signal!: AbortSignal;
	const first = await mount(scope, (_input, options) => {
		signal = options.signal;
		return pending.promise;
	});
	await act(async () => first.state().addFiles([file()]));
	let result!: Promise<boolean>;
	await act(async () => {
		result = first.state().uploadPending("TRL-1");
	});
	await first.close();
	const second = await mount(scope);
	await act(async () => second.state().clear());
	expect(signal.aborted).toBe(true);
	expect(storage.has(`${scope}:uploads`)).toBe(false);
	await act(async () => {
		pending.resolve({});
		await result;
	});
	expect(await result).toBe(false);
	expect(second.state().uploads).toEqual([]);
});

test("unscoped hooks retain independent transient state", async () => {
	const first = await mount();
	await act(async () => first.state().addFiles([file()]));
	await first.close();
	const second = await mount();
	expect(second.state().uploads).toEqual([]);
	expect(storage.size).toBe(0);
});

test("discard clears missing-file metadata without changing another scope", async () => {
	const parentScope = crypto.randomUUID();
	const childScope = crypto.randomUUID();
	const parent = await mount(parentScope);
	await act(async () => parent.state().addFiles([file()]));
	const parentBytes = storage.get(`${parentScope}:uploads`);
	storage.set(`${childScope}:uploads`, JSON.stringify([{ id: "lost", name: "lost.txt", size: 1, lastModified: 5 }]));
	const child = await mount(childScope);
	await act(async () => child.state().clear());
	expect(child.state().missingFiles).toEqual([]);
	expect(storage.has(`${childScope}:uploads`)).toBe(false);
	expect(storage.get(`${parentScope}:uploads`)).toBe(parentBytes);
	await act(async () => {
		expect(await child.state().uploadPending("TRL-1")).toBe(true);
	});
});
