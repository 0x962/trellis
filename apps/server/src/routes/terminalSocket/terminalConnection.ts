import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import type { ServerWebSocket } from "bun";
import type { BunWebSocketData } from "hono/bun";
import type { WSContext, WSEvents } from "hono/ws";
import { z } from "zod";
import { legacyTerminalChannel } from "./legacyTerminalChannel.ts";

const commandSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("input"), data: z.string().max(1024 * 1024), userInput: z.boolean() }),
	z.object({
		type: z.literal("resize"),
		cols: z.number().int().min(1).max(1000),
		rows: z.number().int().min(1).max(1000),
	}),
	z.object({ type: z.literal("ack"), offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }),
]);
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const OUTPUT_WINDOW_BYTES = 256 * 1024;

export function terminalConnection(
	client: Pick<RuntimeClient, "terminal" | "subscribe" | "input" | "resize">,
	terminalId: string,
	offset: number,
	binaryChannel: boolean,
	acknowledgements: boolean,
): WSEvents {
	const abort = new AbortController();
	let transport: Pick<ReturnType<RuntimeClient["terminal"]>, "input" | "resize">;
	let sentOffset = offset;
	let acknowledgedOffset = offset;
	let resumeOutput: (() => void) | undefined;
	let writable = false;
	const close = (ws: WSContext, code = 1000, reason = "Terminal closed") => {
		abort.abort();
		resumeOutput?.();
		ws.close(code, reason);
	};
	const fail = (ws: WSContext, error: unknown) => {
		if (abort.signal.aborted) return;
		ws.send(JSON.stringify({ type: "error", message: (error as Error).message }));
		close(ws, 1011, "Terminal connection failed");
	};
	const follow = async (ws: WSContext) => {
		const channel = binaryChannel
			? client.terminal(terminalId, offset, abort.signal)
			: legacyTerminalChannel(client, terminalId, offset, abort.signal, (error) => fail(ws, error));
		transport = channel;
		for await (const event of channel.events) {
			const raw = ws.raw as ServerWebSocket<BunWebSocketData>;
			if (raw.getBufferedAmount() > MAX_OUTPUT_BYTES) {
				close(ws, 1013, "Terminal output exceeds the connection buffer. Reconnect to resume.");
				return;
			}
			if (event.type === "session") {
				writable = event.session.mode === "pty" && event.session.status === "running" && event.session.controllable;
				ws.send(JSON.stringify(event));
			} else {
				const bytes = event.data;
				const frame = new Uint8Array(17 + bytes.length);
				const header = new DataView(frame.buffer);
				header.setFloat64(0, event.startOffset);
				header.setFloat64(8, event.nextOffset);
				header.setUint8(16, Number(event.truncated));
				frame.set(bytes, 17);
				if (event.truncated) acknowledgedOffset = Math.max(acknowledgedOffset, event.startOffset);
				sentOffset = event.nextOffset;
				ws.send(frame);
				while (acknowledgements && sentOffset - acknowledgedOffset >= OUTPUT_WINDOW_BYTES && !abort.signal.aborted) {
					await new Promise<void>((resolve) => {
						resumeOutput = resolve;
					});
					resumeOutput = undefined;
				}
			}
		}
		close(ws);
	};
	return {
		onOpen: (_event, ws) => {
			void follow(ws).catch((error) => fail(ws, error));
		},
		onMessage: (event, ws) => {
			if (abort.signal.aborted) return;
			try {
				if (typeof event.data !== "string") throw new Error("Terminal commands must be JSON text.");
				const command = commandSchema.parse(JSON.parse(event.data));
				if (command.type === "ack") {
					if (command.offset > sentOffset) throw new Error("Terminal acknowledgement exceeds delivered output");
					acknowledgedOffset = Math.max(acknowledgedOffset, command.offset);
					resumeOutput?.();
					return;
				}
				if (!writable) throw new Error("This agent does not have a running interactive terminal.");
				if (command.type === "input") transport.input(Buffer.from(command.data), command.userInput);
				else transport.resize(command.cols, command.rows);
			} catch (error) {
				fail(ws, error);
			}
		},
		onClose: () => {
			abort.abort();
			resumeOutput?.();
		},
		onError: (_event, ws) => close(ws, 1011, "Terminal connection failed"),
	};
}
