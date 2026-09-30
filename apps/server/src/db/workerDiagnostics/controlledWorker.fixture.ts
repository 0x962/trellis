import { createOperationDiagnostics, diagnosticNow } from "../operationDiagnostics";

type Command =
	| { type: "block" | "call"; buffer: SharedArrayBuffer }
	| { type: "overhead"; enabled: boolean; count: number };

declare const self: Worker;

self.onmessage = ({ data }: MessageEvent<Command>) => {
	const diagnostics = createOperationDiagnostics((event) => postMessage({ type: "diagnostic", event }));
	if (data.type === "overhead") {
		const start = performance.now();
		for (let index = 0; index < data.count; index += 1) {
			if (data.enabled) {
				postMessage({ type: "diagnostic", event: { type: "receipt", id: index, at: diagnosticNow() } });
				postMessage({ type: "diagnostic", event: { type: "execution", id: index, at: diagnosticNow() } });
			}
			const finishService = data.enabled
				? diagnostics.begin({ phase: "service", name: "fixture.call", reqId: "overhead" })
				: undefined;
			const finishWait = data.enabled
				? diagnostics.begin({ phase: "transaction.wait", name: "fixture.call", reqId: "overhead" })
				: undefined;
			finishWait?.("success");
			const finishTransaction = data.enabled
				? diagnostics.begin({ phase: "transaction", name: "fixture.call", reqId: "overhead" })
				: undefined;
			finishTransaction?.("success");
			finishService?.("success");
		}
		postMessage({ type: "done", workerMs: performance.now() - start });
		return;
	}
	if (data.type === "call") {
		postMessage({ type: "diagnostic", event: { type: "receipt", id: 1, at: diagnosticNow() } });
		postMessage({ type: "diagnostic", event: { type: "execution", id: 1, at: diagnosticNow() } });
	}
	const finish = diagnostics.begin({ phase: "transaction", name: "fixture.block", reqId: data.type });
	postMessage({ type: "blocked", phase: data.type });
	Atomics.wait(new Int32Array(data.buffer), 0, 0);
	finish("success");
	postMessage({ type: "done" });
};
