import type { AgentRun } from "@trellis/api";
import type { TerminalFrame } from "@trellis/ui/terminal";
import type { TerminalProcess } from "../terminalStream";

const INPUT_CHUNK_BYTES = 64 * 1024;

type Options = {
	run: Pick<AgentRun, "id" | "terminalId" | "sessionId">;
	offset: number;
	signal: AbortSignal;
	onOutput: (frame: TerminalFrame) => Promise<void>;
	onSession: (session: TerminalProcess) => void;
	origin?: string;
	createSocket?: (url: string) => WebSocket;
};

export function createTerminalSocket({
	run,
	offset,
	signal,
	onOutput,
	onSession,
	origin = location.origin,
	createSocket = (url) => new WebSocket(url),
}: Options) {
	const url = new URL(`/api/agent-runs/${run.id}/terminal/socket`, origin);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("attemptId", run.terminalId!);
	url.searchParams.set("offset", String(offset));
	url.searchParams.set("ack", "1");
	if (run.sessionId) url.searchParams.set("sessionId", run.sessionId);
	const socket = createSocket(url.toString());
	socket.binaryType = "arraybuffer";
	const done = Promise.withResolvers<void>();
	const outputWrites = new Set<Promise<void>>();
	let inputAcknowledgement: PromiseWithResolvers<void> | undefined;
	let commands = Promise.resolve();
	let exited = false;
	let closed = false;
	let settled = false;
	let acknowledgedOffset = offset;
	const detach = () => {
		socket.removeEventListener("message", message);
		socket.removeEventListener("close", close);
		socket.removeEventListener("error", error);
	};
	const finish = (failure?: unknown) => {
		if (settled) return;
		settled = true;
		closed = true;
		inputAcknowledgement?.reject(failure ?? new Error("The terminal connection closed."));
		inputAcknowledgement = undefined;
		detach();
		signal.removeEventListener("abort", abort);
		socket.close();
		if (failure) done.reject(failure);
		else done.resolve();
	};
	const abort = () => finish();
	const error = () => finish(new Error("The terminal connection failed."));
	const close = () => {
		closed = true;
		detach();
		if (!exited) {
			finish(new Error("The terminal connection closed before the process exited."));
			return;
		}
		void Promise.all(outputWrites).then(() => finish(), finish);
	};
	const message = (event: MessageEvent<string | ArrayBuffer>) => {
		try {
			if (event.data instanceof ArrayBuffer) {
				const header = new DataView(event.data);
				const nextOffset = header.getFloat64(8);
				const pending = onOutput({
					startOffset: header.getFloat64(0),
					nextOffset,
					truncated: header.getUint8(16) === 1,
					data: new Uint8Array(event.data, 17),
				});
				outputWrites.add(pending);
				void pending.then(() => {
					outputWrites.delete(pending);
					if (closed || socket.readyState !== WebSocket.OPEN || nextOffset <= acknowledgedOffset) return;
					acknowledgedOffset = nextOffset;
					void send({ type: "ack", offset: nextOffset }).catch(finish);
				}, finish);
				return;
			}
			const data = JSON.parse(event.data) as
				| { type: "session"; session: TerminalProcess }
				| { type: "error"; message: string }
				| { type: "input-ack" };
			if (data.type === "error") {
				finish(new Error(data.message));
				return;
			}
			if (data.type === "input-ack") {
				if (!inputAcknowledgement) throw new Error("The terminal sent an unexpected input acknowledgement.");
				inputAcknowledgement.resolve();
				return;
			}
			exited = data.session.status === "exited";
			onSession(data.session);
		} catch (failure) {
			finish(failure);
		}
	};
	const enqueue = (command: () => Promise<void> | void) => {
		const next = commands.then(command);
		commands = next;
		return next;
	};
	const send = (value: object) =>
		enqueue(() => {
			if (closed || socket.readyState !== WebSocket.OPEN) throw new Error("The terminal is not connected.");
			socket.send(JSON.stringify(value));
		});
	const sendInput = (data: string, userInput: boolean) => {
		const bytes = new TextEncoder().encode(data);
		return enqueue(async () => {
			const length = Math.max(bytes.byteLength, 1);
			for (let start = 0; start < length; start += INPUT_CHUNK_BYTES) {
				if (closed || socket.readyState !== WebSocket.OPEN) throw new Error("The terminal is not connected.");
				const chunk = bytes.subarray(start, start + INPUT_CHUNK_BYTES);
				const frame = new Uint8Array(1 + chunk.byteLength);
				frame[0] = Number(userInput);
				frame.set(chunk, 1);
				inputAcknowledgement = Promise.withResolvers<void>();
				socket.send(frame);
				await inputAcknowledgement.promise;
				inputAcknowledgement = undefined;
			}
		});
	};
	socket.addEventListener("message", message);
	socket.addEventListener("close", close);
	socket.addEventListener("error", error);
	signal.addEventListener("abort", abort, { once: true });
	if (signal.aborted) abort();
	return {
		done: done.promise,
		send: sendInput,
		resize: (cols: number, rows: number) => send({ type: "resize", cols, rows }),
	};
}
