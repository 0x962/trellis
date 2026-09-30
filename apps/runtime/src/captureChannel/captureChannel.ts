import type { Socket } from "node:net";
import type { RuntimeCaptureFrame, RuntimeCaptureRequest } from "@trellis/runtime-protocol";
import { CaptureFrameDecoder, encodeCaptureFrame } from "@trellis/runtime-protocol/capture-wire";
import type { SessionStore } from "../sessionStore.ts";

const errorFrame = (error: unknown): RuntimeCaptureFrame => ({
	type: "error",
	code: (error as { code?: string }).code ?? "CAPTURE_UNAVAILABLE",
	message: (error as Error).message,
});

export async function serveCaptureChannel(
	store: SessionStore,
	socket: Socket,
	request: RuntimeCaptureRequest,
	initial: Buffer,
) {
	const controller = new AbortController();
	const decoder = new CaptureFrameDecoder();
	const abort = () => controller.abort(new Error("Capture channel closed"));
	const write = (frame: RuntimeCaptureFrame) =>
		new Promise<void>((resolve, reject) => {
			socket.write(encodeCaptureFrame(frame), (error) => {
				if (error) reject(error);
				else resolve();
			});
		});
	const frames = async function* () {
		if (initial.length > 0) yield* decoder.push(initial);
		for await (const chunk of socket) yield* decoder.push(chunk as Buffer);
		if (decoder.incomplete) throw new Error("Capture channel closed with an incomplete frame");
	}();
	socket.setTimeout(0);
	socket.once("close", abort);
	socket.once("end", abort);
	socket.resume();
	try {
		await store.capture(
			request,
			async (producer) => {
				await write({ type: "binding", binding: producer.binding });
				for await (const frame of frames) {
					controller.signal.throwIfAborted();
					if (frame.type === "inventory") {
						await write({ type: "inventory-result", inventory: await producer.inventory(frame.binding, controller.signal) });
					} else if (frame.type === "read") {
						for await (const data of producer.read(frame.input, controller.signal)) await write({ type: "data", data });
						await write({ type: "end" });
					} else if (frame.type === "seal") {
						await write({ type: "receipt", receipt: await producer.seal(frame.input, controller.signal) });
					} else if (frame.type === "release") {
						await write({ type: "released" });
						socket.end();
						return;
					} else throw new Error(`Unexpected capture frame ${frame.type}`);
				}
				throw new Error("Capture channel closed before release");
			},
			controller.signal,
		);
	} catch (error) {
		if (!socket.destroyed) {
			await write(errorFrame(error));
			socket.end();
		}
	} finally {
		controller.abort();
		socket.off("close", abort);
		socket.off("end", abort);
	}
}
