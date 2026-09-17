import type { AgentRun } from "@trellis/api";
import type { TerminalFrame } from "@trellis/ui/terminal";
import type { TerminalProcess } from "../terminalStream";

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
	if (run.sessionId) url.searchParams.set("sessionId", run.sessionId);
	const socket = createSocket(url.toString());
	socket.binaryType = "arraybuffer";
	const done = Promise.withResolvers<void>();
	const writes = new Set<Promise<void>>();
	let exited = false;
	let closed = false;
	let settled = false;
	const detach = () => {
		socket.removeEventListener("message", message);
		socket.removeEventListener("close", close);
		socket.removeEventListener("error", error);
	};
	const finish = (failure?: unknown) => {
		if (settled) return;
		settled = true;
		closed = true;
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
		void Promise.all(writes).then(() => finish(), finish);
	};
	const message = (event: MessageEvent<string | ArrayBuffer>) => {
		try {
			if (event.data instanceof ArrayBuffer) {
				const header = new DataView(event.data);
				const pending = onOutput({
					startOffset: header.getFloat64(0),
					nextOffset: header.getFloat64(8),
					truncated: header.getUint8(16) === 1,
					data: new Uint8Array(event.data, 17),
				});
				writes.add(pending);
				void pending.then(() => writes.delete(pending), finish);
				return;
			}
			const data = JSON.parse(event.data) as
				| { type: "session"; session: TerminalProcess }
				| { type: "error"; message: string };
			if (data.type === "error") {
				finish(new Error(data.message));
				return;
			}
			exited = data.session.status === "exited";
			onSession(data.session);
		} catch (failure) {
			finish(failure);
		}
	};
	const send = async (value: object) => {
		if (closed || socket.readyState !== WebSocket.OPEN) throw new Error("The terminal is not connected.");
		const data = JSON.stringify(value);
		if (socket.bufferedAmount + new TextEncoder().encode(data).length > 1024 * 1024) {
			const failure = new Error("The terminal input buffer is full. Reconnect to continue.");
			finish(failure);
			throw failure;
		}
		socket.send(data);
	};
	socket.addEventListener("message", message);
	socket.addEventListener("close", close);
	socket.addEventListener("error", error);
	signal.addEventListener("abort", abort, { once: true });
	if (signal.aborted) abort();
	return {
		done: done.promise,
		send: (data: string, userInput: boolean) => send({ type: "input", data, userInput }),
		resize: (cols: number, rows: number) => send({ type: "resize", cols, rows }),
	};
}
