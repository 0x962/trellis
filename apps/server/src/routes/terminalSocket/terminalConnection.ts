import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import type { ServerWebSocket } from "bun";
import type { BunWebSocketData } from "hono/bun";
import type { WSContext, WSEvents } from "hono/ws";
import { z } from "zod";

const commandSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("input"), data: z.string().max(1024 * 1024), userInput: z.boolean() }),
	z.object({
		type: z.literal("resize"),
		cols: z.number().int().min(1).max(1000),
		rows: z.number().int().min(1).max(1000),
	}),
]);
type Command = z.infer<typeof commandSchema>;
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export function terminalConnection(
	client: Pick<RuntimeClient, "subscribe" | "input" | "resize">,
	terminalId: string,
	offset: number,
): WSEvents {
	const abort = new AbortController();
	const pending: { command: Command; size: number }[] = [];
	let pendingBytes = 0;
	let draining = false;
	let writable = false;
	const close = (ws: WSContext, code = 1000, reason = "Terminal closed") => {
		abort.abort();
		pending.length = 0;
		pendingBytes = 0;
		ws.close(code, reason);
	};
	const fail = (ws: WSContext, error: unknown) => {
		if (abort.signal.aborted) return;
		ws.send(JSON.stringify({ type: "error", message: (error as Error).message }));
		close(ws, 1011, "Terminal connection failed");
	};
	const drain = async () => {
		if (draining) return;
		draining = true;
		while (pending.length && !abort.signal.aborted) {
			const { command, size } = pending.shift()!;
			if (command.type === "input")
				await client.input(terminalId, Buffer.from(command.data).toString("base64"), command.userInput);
			else await client.resize(terminalId, command.cols, command.rows);
			pendingBytes -= size;
		}
		draining = false;
	};
	const follow = async (ws: WSContext) => {
		for await (const event of client.subscribe(terminalId, offset, abort.signal)) {
			const raw = ws.raw as ServerWebSocket<BunWebSocketData>;
			if (raw.getBufferedAmount() > MAX_OUTPUT_BYTES) {
				close(ws, 1013, "Terminal output exceeds the connection buffer. Reconnect to resume.");
				return;
			}
			if (event.type === "session") {
				writable = event.session.mode === "pty" && event.session.status === "running" && event.session.controllable;
				ws.send(JSON.stringify(event));
			} else {
				const bytes = Buffer.from(event.data, "base64");
				const frame = new Uint8Array(17 + bytes.length);
				const header = new DataView(frame.buffer);
				header.setFloat64(0, event.startOffset);
				header.setFloat64(8, event.nextOffset);
				header.setUint8(16, Number(event.truncated));
				frame.set(bytes, 17);
				ws.send(frame);
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
				if (!writable) throw new Error("This agent does not have a running interactive terminal.");
				if (typeof event.data !== "string") throw new Error("Terminal commands must be JSON text.");
				const command = commandSchema.parse(JSON.parse(event.data));
				const size = Buffer.byteLength(event.data);
				if (pendingBytes + size > MAX_INPUT_BYTES || pending.length >= 1024)
					throw new Error("Terminal input exceeds the connection buffer. Reconnect before further input.");
				pendingBytes += size;
				pending.push({ command, size });
				void drain().catch((error) => fail(ws, error));
			} catch (error) {
				fail(ws, error);
			}
		},
		onClose: () => {
			abort.abort();
			pending.length = 0;
			pendingBytes = 0;
		},
		onError: (_event, ws) => close(ws, 1011, "Terminal connection failed"),
	};
}
