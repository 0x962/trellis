import type { Socket } from "node:net";
import type { RuntimeMethods } from "@trellis/runtime-protocol";
import { encodeTerminalFrame, type TerminalFrame, TerminalFrameDecoder } from "@trellis/runtime-protocol/terminal-wire";
import { outputSubscription } from "../outputSubscription.ts";
import type { SessionStore } from "../sessionStore.ts";

type Command = Extract<TerminalFrame, { type: "input" | "resize" }>;

export async function serveTerminalChannel(
	store: SessionStore,
	socket: Socket,
	params: RuntimeMethods["terminal"]["params"],
	initial: Buffer,
) {
	const controller = new AbortController();
	const decoder = new TerminalFrameDecoder(1024 * 1024 + 2);
	const pending: Command[] = [];
	let pendingBytes = 0;
	let draining = false;
	let writable = false;
	const abort = () => {
		controller.abort();
		pending.length = 0;
		pendingBytes = 0;
	};
	const fail = (error: unknown) => {
		if (controller.signal.aborted) return;
		abort();
		socket.end(encodeTerminalFrame({ type: "error", message: (error as Error).message }));
	};
	const drain = async () => {
		if (draining) return;
		draining = true;
		while (pending.length && !controller.signal.aborted) {
			const command = pending.shift()!;
			if (command.type === "input") {
				await store.inputBytes(params.id, Buffer.from(command.data), command.userInput);
				pendingBytes -= command.data.byteLength;
			} else store.resize(params.id, command.cols, command.rows);
		}
		draining = false;
	};
	const receive = (chunk: Buffer) => {
		if (controller.signal.aborted) return;
		try {
			for (const frame of decoder.push(chunk)) {
				if (frame.type !== "input" && frame.type !== "resize") throw new Error("Unexpected terminal client frame");
				if (!writable) throw new Error("This session has no running interactive terminal");
				const size = frame.type === "input" ? frame.data.byteLength : 0;
				if (pendingBytes + size > 1024 * 1024 || pending.length >= 1024)
					throw new Error("The terminal input buffer is full");
				pendingBytes += size;
				pending.push(frame);
			}
			void drain().catch(fail);
		} catch (error) {
			fail(error);
		}
	};
	socket.setTimeout(0);
	socket.once("close", abort);
	socket.once("end", abort);
	socket.on("data", receive);
	try {
		const output = outputSubscription(
			{
				subscribe: store.subscribe.bind(store),
				inspect: store.inspect.bind(store),
				outputComplete: store.outputComplete.bind(store),
				output: store.outputBytes.bind(store),
			},
			params,
			async (event) => {
				if (event.type === "session")
					writable = event.session.mode === "pty" && event.session.status === "running" && event.session.controllable;
				const bytes = encodeTerminalFrame(event);
				await new Promise<void>((resolve, reject) => {
					const timer = setTimeout(() => {
						socket.destroy();
						reject(new Error("Terminal subscriber did not accept output within 30 seconds"));
					}, 30_000);
					socket.write(bytes, (error) => {
						clearTimeout(timer);
						if (error) reject(error);
						else resolve();
					});
				});
			},
			controller.signal,
		);
		if (initial.length) receive(initial);
		socket.resume();
		await output;
		socket.end();
	} catch (error) {
		fail(error);
	} finally {
		abort();
		socket.off("data", receive);
		socket.off("close", abort);
		socket.off("end", abort);
	}
}
