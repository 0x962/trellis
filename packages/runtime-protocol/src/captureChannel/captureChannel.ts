import { createHash, randomUUID } from "node:crypto";
import { Socket } from "node:net";
import type {
	RuntimeCaptureAction,
	RuntimeCaptureBinding,
	RuntimeCaptureFrame,
	RuntimeCaptureInventory,
	RuntimeCaptureProducer,
	RuntimeCaptureReadInput,
	RuntimeCaptureRequest,
	RuntimeCaptureResult,
	RuntimeCaptureSealInput,
} from "../capture.ts";
import { RUNTIME_PROTOCOL_VERSION } from "../index.ts";
import { CaptureFrameDecoder, encodeCaptureFrame } from "../captureWire";

const failure = (frame: Extract<RuntimeCaptureFrame, { type: "error" }>) =>
	Object.assign(new Error(frame.message), { code: frame.code });

const validateFinalization = (value: RuntimeCaptureResult<unknown>["finalization"], request: RuntimeCaptureRequest) => {
	const receipt = JSON.parse(value.receiptBytes);
	if (
		JSON.stringify(receipt) !== JSON.stringify(value.receipt) ||
		receipt.schemaVersion !== 1 ||
		receipt.kind !== "trellis-runtime-capture-finalization" ||
		JSON.stringify(receipt.request) !== JSON.stringify(request) ||
		receipt.requestSha256 !== createHash("sha256").update(JSON.stringify(request)).digest("hex") ||
		receipt.outcome !== "committed" ||
		typeof receipt.finalizedAt !== "string" ||
		!Number.isFinite(Date.parse(receipt.finalizedAt))
	)
		throw new Error("Runtime capture returned an invalid finalization receipt");
};

export async function withCaptureSnapshot<T>(
	socketPath: string,
	request: RuntimeCaptureRequest,
	action: RuntimeCaptureAction<T>,
	timeoutMs?: number,
	signal?: AbortSignal,
): Promise<RuntimeCaptureResult<T>> {
	signal?.throwIfAborted();
	const socket = new Socket();
	const decoder = new CaptureFrameDecoder();
	const lifetime = new AbortController();
	let stopped: Error | undefined;
	const stop = (error: Error) => {
		if (!lifetime.signal.aborted) lifetime.abort(error);
		stopped = error;
		socket.destroy(error);
	};
	const abort = () => stop(signal!.reason instanceof Error ? signal!.reason : new Error("Capture aborted"));
	signal?.addEventListener("abort", abort, { once: true });
	if (timeoutMs !== undefined)
		socket.setTimeout(timeoutMs, () => stop(new Error("Runtime capture response is unknown: request timed out")));
	const connected = Promise.withResolvers<void>();
	socket.once("connect", () => connected.resolve());
	socket.once("error", (error) => connected.reject(error));
	socket.once("close", () => {
		if (!lifetime.signal.aborted) lifetime.abort(new Error("Runtime capture channel closed"));
	});
	socket.once("end", () => {
		if (!lifetime.signal.aborted) lifetime.abort(new Error("Runtime capture channel ended"));
	});
	const frames = (async function* () {
		for await (const chunk of socket) yield* decoder.push(chunk as Buffer);
		if (stopped !== undefined) throw stopped;
		if (decoder.incomplete) throw new Error("Runtime capture channel closed with an incomplete frame");
	})();
	const iterator = frames[Symbol.asyncIterator]();
	const next = async (operationSignal?: AbortSignal) => {
		operationSignal?.throwIfAborted();
		const operationAbort = () =>
			stop(
				operationSignal!.reason instanceof Error ? operationSignal!.reason : new Error("Capture operation aborted"),
			);
		operationSignal?.addEventListener("abort", operationAbort, { once: true });
		try {
			const result = await iterator.next();
			if (result.done) throw new Error("Runtime capture channel closed before finalization");
			if (result.value.type === "error") throw failure(result.value);
			return result.value;
		} finally {
			operationSignal?.removeEventListener("abort", operationAbort);
		}
	};
	const write = (frame: RuntimeCaptureFrame) =>
		new Promise<void>((resolve, reject) => {
			socket.write(encodeCaptureFrame(frame), (error) => {
				if (error) reject(error);
				else resolve();
			});
		});
	let operation: Promise<unknown> | undefined;
	const exclusive = async <R>(work: () => Promise<R>): Promise<R> => {
		if (operation !== undefined) throw new Error("A runtime capture operation is already active");
		const current = work();
		operation = current;
		try {
			return await current;
		} finally {
			if (operation === current) operation = undefined;
		}
	};
	const inventory = (binding: RuntimeCaptureBinding, operationSignal?: AbortSignal) =>
		exclusive(async (): Promise<RuntimeCaptureInventory> => {
			await write({ type: "inventory", binding });
			const frame = await next(operationSignal);
			if (frame.type !== "inventory-result") throw new Error("Unexpected runtime capture inventory response");
			return frame.inventory;
		});
	const read = async function* (input: RuntimeCaptureReadInput, operationSignal?: AbortSignal) {
		if (operation !== undefined) throw new Error("A runtime capture operation is already active");
		const complete = Promise.withResolvers<void>();
		operation = complete.promise;
		try {
			await write({ type: "read", input });
			for (;;) {
				const frame = await next(operationSignal);
				if (frame.type === "end") return;
				if (frame.type !== "data") throw new Error("Unexpected runtime capture read response");
				yield frame.data;
			}
		} finally {
			complete.resolve();
			if (operation === complete.promise) operation = undefined;
		}
	};
	const seal = (input: RuntimeCaptureSealInput, operationSignal?: AbortSignal) =>
		exclusive(async () => {
			await write({ type: "seal", input });
			const frame = await next(operationSignal);
			if (frame.type !== "receipt") throw new Error("Unexpected runtime capture seal response");
			return frame.receipt;
		});
	try {
		socket.connect(socketPath);
		await connected.promise;
		await new Promise<void>((resolve, reject) => {
			socket.write(
				`${JSON.stringify({ id: randomUUID(), version: RUNTIME_PROTOCOL_VERSION, method: "capture", params: request })}\n`,
				(error) => {
					if (error) reject(error);
					else resolve();
				},
			);
		});
		const opened = await next(signal);
		if (opened.type !== "binding") throw new Error("Runtime capture did not return a binding");
		const producer: RuntimeCaptureProducer = { binding: opened.binding, signal: lifetime.signal, inventory, read, seal };
		const result = await action(producer);
		if (operation !== undefined) throw new Error("A runtime capture operation is still active");
		producer.signal.throwIfAborted();
		await write({ type: "finalize", outcome: "committed" });
		const finalized = await next(signal);
		if (finalized.type !== "finalized") throw new Error("Runtime capture did not confirm finalization");
		validateFinalization(finalized.finalization, request);
		socket.end();
		return { value: result, finalization: finalized.finalization };
	} finally {
		signal?.removeEventListener("abort", abort);
		socket.destroy();
	}
}
