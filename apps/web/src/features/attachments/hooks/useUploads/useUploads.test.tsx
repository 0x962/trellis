import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createFakeScheduler } from "../../../../../test/fakeScheduler";
import { type AppContext, AppProvider } from "../../../../lib/appContext";
import { useUploads } from "./useUploads";

type Call = { ticket: string; file: File; signal: AbortSignal };
type Settle = { ok: () => void; fail: (error: unknown) => void };

const fileNamed = (name: string) => new File([name], name, { type: "text/plain" });

// The fake `attachments.upload` never settles on its own. Each call parks a
// `Settle` in `settles`, so a test decides when the server answers and what
// it answers. That timing is what every race in this hook depends on.
const setup = (ticket?: string) => {
	const clock = createFakeScheduler();
	const calls: Call[] = [];
	const settles: Settle[] = [];
	const client = {
		attachments: {
			upload: (input: { ticket: string; file: File }, options: { signal: AbortSignal }) => {
				calls.push({ ...input, signal: options.signal });
				return new Promise((resolve, reject) => settles.push({ ok: () => resolve({}), fail: reject }));
			},
		},
	};
	const context = {
		client,
		queryClient: { invalidateQueries: () => Promise.resolve() },
		orpc: { attachments: { list: { queryKey: () => ["attachments", "list"] } } },
		scheduler: clock.scheduler,
	} as unknown as AppContext;
	const wrapper = ({ children }: { children: ReactNode }) => <AppProvider value={context}>{children}</AppProvider>;
	const hook = renderHook(() => useUploads(ticket, false), { wrapper });
	return { hook, calls, settles };
};

describe("features/attachments/hooks/useUploads", () => {
	test("keeps every added file pending until uploadPending receives a ticket", () => {
		const { hook, calls } = setup();
		act(() => hook.result.current.addFiles([fileNamed("brief.txt")]));
		expect(calls).toHaveLength(0);
		expect(hook.result.current.uploads.map((upload) => upload.status)).toEqual(["pending"]);
	});

	test("clear aborts the request of a running upload, so a discard attaches no file", async () => {
		const { hook, calls, settles } = setup();
		act(() => hook.result.current.addFiles([fileNamed("discard.txt")]));
		act(() => void hook.result.current.uploadPending("CRT-1"));
		await waitFor(() => expect(calls).toHaveLength(1));
		act(() => hook.result.current.clear());
		expect(calls[0]!.signal.aborted).toBe(true);
		// The server can still answer after the abort. The list stays empty.
		await act(async () => {
			settles[0]!.ok();
			await Promise.resolve();
		});
		expect(hook.result.current.uploads).toHaveLength(0);
	});

	test("a second retry while the first request runs sends one request", async () => {
		const { hook, calls, settles } = setup();
		act(() => hook.result.current.addFiles([fileNamed("retry.txt")]));
		act(() => void hook.result.current.uploadPending("CRT-1"));
		await waitFor(() => expect(calls).toHaveLength(1));
		await act(async () => {
			settles[0]!.fail(new Error("the network dropped"));
			await Promise.resolve();
		});
		const id = hook.result.current.uploads[0]!.id;
		await act(async () => {
			void hook.result.current.retry(id, "CRT-1");
			void hook.result.current.retry(id, "CRT-1");
			await Promise.resolve();
		});
		expect(calls).toHaveLength(2);
	});

	test("uploadPending reports false when a file arrives while the requests run", async () => {
		const { hook, calls, settles } = setup();
		act(() => hook.result.current.addFiles([fileNamed("first.txt")]));
		let settled: boolean | undefined;
		act(() => void hook.result.current.uploadPending("CRT-1").then((value) => (settled = value)));
		await waitFor(() => expect(calls).toHaveLength(1));
		act(() => hook.result.current.addFiles([fileNamed("second.txt")]));
		await act(async () => {
			settles[0]!.ok();
			await Promise.resolve();
		});
		await waitFor(() => expect(settled).toBe(false));
		expect(hook.result.current.uploads.map((upload) => upload.file.name)).toEqual(["first.txt", "second.txt"]);
	});

	test("an archived project keeps its own error instead of a retryable failure", async () => {
		const { hook, calls, settles } = setup();
		act(() => hook.result.current.addFiles([fileNamed("plan.txt")]));
		act(() => void hook.result.current.uploadPending("CRT-1"));
		await waitFor(() => expect(calls).toHaveLength(1));
		await act(async () => {
			settles[0]!.fail(new ORPCError("PROJECT_ARCHIVED", { defined: true }));
			await Promise.resolve();
		});
		await waitFor(() => expect(hook.result.current.uploads[0]!.error).toEqual({ code: "PROJECT_ARCHIVED" }));
	});

	test("a size refusal carries the cap the server reported", async () => {
		const { hook, calls, settles } = setup();
		act(() => hook.result.current.addFiles([fileNamed("huge.txt")]));
		act(() => void hook.result.current.uploadPending("CRT-1"));
		await waitFor(() => expect(calls).toHaveLength(1));
		await act(async () => {
			settles[0]!.fail(new ORPCError("PAYLOAD_TOO_LARGE", { defined: true, data: { maxBytes: 1024 * 1024 } }));
			await Promise.resolve();
		});
		await waitFor(() =>
			expect(hook.result.current.uploads[0]!.error).toEqual({ code: "PAYLOAD_TOO_LARGE", maxBytes: 1024 * 1024 }),
		);
	});

	test("a server error code that no branch names reads as a plain upload failure", async () => {
		const { hook, calls, settles } = setup();
		act(() => hook.result.current.addFiles([fileNamed("later.txt")]));
		act(() => void hook.result.current.uploadPending("CRT-1"));
		await waitFor(() => expect(calls).toHaveLength(1));
		// A code the contract adds after this file was written.
		await act(async () => {
			settles[0]!.fail(new ORPCError("QUOTA_EXCEEDED", { defined: true }));
			await Promise.resolve();
		});
		await waitFor(() => expect(hook.result.current.uploads[0]!.error).toEqual({ code: "UPLOAD_FAILED" }));
	});

	test("a hook with a ticket uploads each added file at once", async () => {
		const { hook, calls } = setup("CRT-9");
		act(() => hook.result.current.addFiles([fileNamed("one.txt"), fileNamed("two.txt")]));
		await waitFor(() => expect(calls).toHaveLength(2));
		expect(calls.map((call) => call.ticket)).toEqual(["CRT-9", "CRT-9"]);
		expect(hook.result.current.uploads.map((upload) => upload.status)).toEqual(["uploading", "uploading"]);
	});
});
