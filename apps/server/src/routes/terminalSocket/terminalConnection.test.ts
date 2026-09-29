import { expect, test } from "bun:test";
import type { RuntimeProcessStatus, RuntimeTerminalEvent } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import type { WSContext } from "hono/ws";
import { terminalConnection } from "./terminalConnection.ts";

test("passes a resize above 1000 to the runtime", async () => {
	const ready = Promise.withResolvers<void>();
	const finish = Promise.withResolvers<void>();
	let resized: [number, number] | undefined;
	async function* events(): AsyncGenerator<RuntimeTerminalEvent> {
		yield {
			type: "session",
			session: {
				mode: "pty",
				status: "running",
				controllable: true,
			} as RuntimeProcessStatus,
		};
		await finish.promise;
	}
	const client = {
		terminal: () => ({
			events: events(),
			input: async () => {},
			resize: async (cols: number, rows: number) => {
				resized = [cols, rows];
			},
		}),
	} as unknown as Pick<RuntimeClient, "terminal" | "subscribe" | "input" | "resize">;
	const socket = {
		raw: { getBufferedAmount: () => 0 },
		send: (value: string) => {
			if (JSON.parse(value).type === "session") ready.resolve();
		},
		close: () => {},
	} as unknown as WSContext;
	const connection = terminalConnection(client, "attempt", 0, true, true);

	connection.onOpen?.({} as never, socket);
	await ready.promise;
	connection.onMessage?.(
		{ data: JSON.stringify({ type: "resize", cols: 1001, rows: 65_535 }) } as MessageEvent,
		socket,
	);

	expect(resized).toEqual([1001, 65_535]);
	finish.resolve();
});
