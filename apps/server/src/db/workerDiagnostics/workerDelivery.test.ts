import { expect, test } from "bun:test";
import { diagnosticNow } from "../operationDiagnostics";
import { type CallDiagnostic, createWorkerDiagnostics, type WorkerDiagnostic } from "./workerDiagnostics";

for (const phase of ["block", "call"] as const) {
	test(`observes a real worker delay ${phase === "block" ? "before receipt" : "during execution"}`, async () => {
		const pending = new Map<number, { diagnostic: CallDiagnostic }>();
		const records: Record<string, unknown>[] = [];
		const diagnostics = createWorkerDiagnostics(pending, (record) => records.push(record));
		const blocked = Promise.withResolvers<void>();
		const completed = Promise.withResolvers<void>();
		const buffer = new SharedArrayBuffer(4);
		const worker = new Worker(new URL("./controlledWorker.fixture.ts", import.meta.url).href);
		worker.onmessage = ({ data }: MessageEvent<{ type: string; event: WorkerDiagnostic }>) => {
			if (data.type === "diagnostic") diagnostics.receive(data.event);
			if (data.type === "blocked") blocked.resolve();
			if (data.type === "done") completed.resolve();
		};
		try {
			if (phase === "call")
				pending.set(1, {
					diagnostic: {
						name: "fixture.call",
						reqId: "call",
						enqueuedAt: diagnosticNow(),
						dispatchedAt: diagnosticNow(),
					},
				});
			worker.postMessage({ type: phase, buffer });
			await blocked.promise;
			if (phase === "block") {
				pending.set(1, {
					diagnostic: {
						name: "fixture.call",
						reqId: "call",
						enqueuedAt: diagnosticNow(),
						dispatchedAt: diagnosticNow(),
					},
				});
				worker.postMessage({ type: "call", buffer });
			}
			await Bun.sleep(1100);
			diagnostics.snapshot();
			expect(records).toHaveLength(1);
			expect(records[0]!.operations).toEqual([
				expect.objectContaining({ phase: "transaction", name: "fixture.block", reqId: phase }),
			]);
			const request = (records[0]!.requests as Array<{ dispatchMs: number; executionMs: number | null }>)[0]!;
			if (phase === "block") {
				expect(request.dispatchMs).toBeGreaterThanOrEqual(1000);
				expect(request.executionMs).toBeNull();
			} else {
				expect(request.dispatchMs).toBeLessThan(1000);
				expect(request.executionMs).toBeGreaterThanOrEqual(1000);
			}
			Atomics.store(new Int32Array(buffer), 0, 1);
			Atomics.notify(new Int32Array(buffer), 0);
			await completed.promise;
		} finally {
			Atomics.store(new Int32Array(buffer), 0, 1);
			Atomics.notify(new Int32Array(buffer), 0);
			worker.terminate();
			diagnostics.clear();
		}
	}, 10_000);
}

test("measures diagnostic delivery overhead across the worker boundary", async () => {
	const worker = new Worker(new URL("./controlledWorker.fixture.ts", import.meta.url).href);
	const measurements: Array<{ enabled: boolean; workerMs: number; totalMs: number; messages: number }> = [];
	try {
		for (const enabled of [false, true, false, true, false, true]) {
			const diagnostics = createWorkerDiagnostics(new Map(), () => undefined);
			let messages = 0;
			const complete = Promise.withResolvers<number>();
			worker.onmessage = ({ data }: MessageEvent<{ type: string; event: WorkerDiagnostic; workerMs: number }>) => {
				if (data.type === "diagnostic") {
					messages += 1;
					diagnostics.receive(data.event);
				} else if (data.type === "done") complete.resolve(data.workerMs);
			};
			const start = performance.now();
			worker.postMessage({ type: "overhead", enabled, count: 1000 });
			const workerMs = await complete.promise;
			measurements.push({ enabled, workerMs, totalMs: performance.now() - start, messages });
			expect(messages).toBe(enabled ? 8000 : 0);
		}
		console.info("worker diagnostic overhead (1000 operations per sample)", JSON.stringify(measurements));
	} finally {
		worker.terminate();
	}
});
