// One `text/event-stream` frame. `id` is the last id seen on the stream,
// so a frame without an `id:` line carries the id before it.
export type SseEvent = { id: string | null; event: string; data: string };

const lineBreak = /\r\n|\r|\n/;

// Reads a byte stream and yields one event per frame. A frame with no
// `data:` line, such as a `: ping` comment, yields nothing.
export async function* readSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
	const decoder = new TextDecoder();
	let buffer = "";
	let lastId: string | null = null;
	let event = "message";
	let data: string[] = [];

	const endFrame = (): SseEvent | undefined => {
		const frame = data.length === 0 ? undefined : { id: lastId, event, data: data.join("\n") };
		event = "message";
		data = [];
		return frame;
	};

	const readLine = (line: string): SseEvent | undefined => {
		if (line === "") return endFrame();
		if (line.startsWith(":")) return undefined;
		const colon = line.indexOf(":");
		const field = colon === -1 ? line : line.slice(0, colon);
		const raw = colon === -1 ? "" : line.slice(colon + 1);
		const value = raw.startsWith(" ") ? raw.slice(1) : raw;
		if (field === "id") lastId = value;
		else if (field === "event") event = value;
		else if (field === "data") data.push(value);
		return undefined;
	};

	for await (const chunk of stream) {
		buffer += decoder.decode(chunk, { stream: true });
		let match = lineBreak.exec(buffer);
		while (match !== null) {
			const line = buffer.slice(0, match.index);
			buffer = buffer.slice(match.index + match[0].length);
			const frame = readLine(line);
			if (frame !== undefined) yield frame;
			match = lineBreak.exec(buffer);
		}
	}
}
