import type { RuntimeTerminalEvent } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";

export function legacyTerminalChannel(
	client: Pick<RuntimeClient, "subscribe" | "input" | "resize">,
	id: string,
	offset: number,
	signal: AbortSignal,
	onError: (error: unknown) => void,
) {
	let queuedBytes = 0;
	let queuedCommands = 0;
	let commands = Promise.resolve();
	const enqueue = (size: number, command: () => Promise<unknown>) => {
		if (queuedBytes + size > 1024 * 1024 || queuedCommands >= 1024)
			throw new Error("The terminal input buffer is full");
		queuedBytes += size;
		queuedCommands++;
		commands = commands.then(async () => {
			if (!signal.aborted) await command();
			queuedBytes -= size;
			queuedCommands--;
		});
		void commands.catch(onError);
	};
	async function* events(): AsyncGenerator<RuntimeTerminalEvent> {
		for await (const event of client.subscribe(id, offset, signal))
			yield event.type === "session" ? event : { ...event, data: Buffer.from(event.data, "base64") };
	}
	return {
		events: events(),
		input: (data: Uint8Array, userInput: boolean) =>
			enqueue(data.byteLength, () => client.input(id, Buffer.from(data).toString("base64"), userInput)),
		resize: (cols: number, rows: number) => enqueue(0, () => client.resize(id, cols, rows)),
	};
}
