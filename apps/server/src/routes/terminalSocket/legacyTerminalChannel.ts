import type { RuntimeTerminalEvent } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";

const INPUT_CHUNK_BYTES = 64 * 1024;

export function legacyTerminalChannel(
	client: Pick<RuntimeClient, "subscribe" | "input" | "resize">,
	id: string,
	offset: number,
	signal: AbortSignal,
	onError: (error: unknown) => void,
) {
	let commands = Promise.resolve();
	const enqueue = (command: () => Promise<unknown>) => {
		commands = commands.then(async () => {
			if (!signal.aborted) await command();
		});
		void commands.catch(onError);
		return commands;
	};
	async function* events(): AsyncGenerator<RuntimeTerminalEvent> {
		for await (const event of client.subscribe(id, offset, signal))
			yield event.type === "session" ? event : { ...event, data: Buffer.from(event.data, "base64") };
	}
	return {
		events: events(),
		input: async (data: Uint8Array, userInput: boolean) => {
			const length = Math.max(data.byteLength, 1);
			for (let start = 0; start < length; start += INPUT_CHUNK_BYTES) {
				const chunk = data.subarray(start, start + INPUT_CHUNK_BYTES);
				await enqueue(() => client.input(id, Buffer.from(chunk).toString("base64"), userInput));
			}
		},
		resize: (cols: number, rows: number) => enqueue(() => client.resize(id, cols, rows)),
	};
}
