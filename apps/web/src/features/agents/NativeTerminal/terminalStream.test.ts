import { expect, test } from "bun:test";
import { consumeTerminalStream } from "./terminalStream";

const responseOf = (text: string) => {
	const bytes = new TextEncoder().encode(text);
	return new Response(
		new ReadableStream({
			start(controller) {
				for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
				controller.close();
			},
		}),
	);
};

test("terminal stream preserves split events and waits for each output write", async () => {
	const events: string[] = [];
	await consumeTerminalStream(
		responseOf(
			'event: session\ndata: {"session":{"status":"running"}}\n\n' +
				'event: output\ndata: {"data":"YQ==","startOffset":0,"nextOffset":1,"truncated":false}\n\n' +
				'event: output\ndata: {"data":"Yg==","startOffset":1,"nextOffset":2,"truncated":false}\n\n' +
				'event: session\ndata: {"session":{"status":"exited"}}\n\n',
		),
		async (frame) => {
			await Promise.resolve();
			expect(frame.data).toBeTypeOf("string");
			events.push(atob(frame.data as string));
		},
		(session) => events.push(session.status),
	);
	expect(events).toEqual(["running", "a", "b", "exited"]);
});

test("terminal stream exposes server errors and unexpected disconnects", async () => {
	await expect(
		consumeTerminalStream(
			responseOf('event: error\ndata: {"code":"ATTEMPT_MISMATCH","message":"The attempt changed."}\n\n'),
			async () => {},
			() => {},
		),
	).rejects.toThrow("The attempt changed.");
	await expect(
		consumeTerminalStream(
			responseOf('event: session\ndata: {"session":{"status":"running"}}\n\n'),
			async () => {},
			() => {},
		),
	).rejects.toThrow("The terminal stream closed before the process exited.");
});
