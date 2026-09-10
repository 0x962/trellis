import type { Hono } from "hono";

// A reader over one text/event-stream response. Messages arrive as the
// server writes them: `id:`, `event:`, and `data:` lines form one message,
// and a line that starts with a colon is a comment (`: ping`). A blank line
// ends a message. `next` rejects after `timeoutMs`, so a stream that stays
// silent fails the test instead of hanging it.

export type SseMessage = { id?: string; event?: string; data?: string; comment?: string };

export type SseReader = {
	response: Response;
	next: (timeoutMs?: number) => Promise<SseMessage>;
	idle: (ms: number) => Promise<boolean>;
	closed: () => Promise<boolean>;
	close: () => Promise<void>;
};

const parseBlock = (block: string): SseMessage => {
	const message: SseMessage = {};
	const data: string[] = [];
	for (const line of block.split("\n")) {
		if (line.startsWith(":")) {
			message.comment = line.slice(1).trim();
			continue;
		}
		const colon = line.indexOf(":");
		const field = colon < 0 ? line : line.slice(0, colon);
		const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
		if (field === "id") message.id = value;
		if (field === "event") message.event = value;
		if (field === "data") data.push(value);
	}
	if (data.length > 0) message.data = data.join("\n");
	return message;
};

export const readSse = (response: Response): SseReader => {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	const queue: SseMessage[] = [];
	let buffer = "";
	let done = false;

	const pull = async () => {
		const chunk = await reader.read();
		if (chunk.done) {
			done = true;
			return;
		}
		buffer += decoder.decode(chunk.value, { stream: true });
		const blocks = buffer.split(/\n\n/);
		buffer = blocks.pop() ?? "";
		for (const block of blocks) if (block.length > 0) queue.push(parseBlock(block));
	};

	const next = async (timeoutMs = 2000): Promise<SseMessage> => {
		const deadline = Date.now() + timeoutMs;
		while (queue.length === 0) {
			if (done) throw new Error("the stream closed before the next message");
			const remaining = deadline - Date.now();
			if (remaining <= 0) throw new Error(`no SSE message within ${timeoutMs} ms`);
			await Promise.race([pull(), Bun.sleep(remaining)]);
		}
		return queue.shift()!;
	};

	const idle = async (ms: number) => {
		if (queue.length > 0) return false;
		await Promise.race([pull(), Bun.sleep(ms)]);
		return queue.length === 0;
	};

	const closed = async () => {
		while (!done) {
			const chunk = await Promise.race([reader.read(), Bun.sleep(2000).then(() => null)]);
			if (chunk === null) return false;
			if (chunk.done) done = true;
		}
		return true;
	};

	return { response, next, idle, closed, close: () => reader.cancel() };
};

// Opens the stream through `app.request`, which needs no port.
export const openSse = async (app: Hono, path: string, headers: Record<string, string> = {}) => {
	const response = await app.request(path, { headers: { accept: "text/event-stream", ...headers } });
	return readSse(response);
};

// Parses the JSON body of one message.
export const dataOf = <T = Record<string, unknown>>(message: SseMessage) => JSON.parse(message.data!) as T;

// The next message that is not a ping comment.
export const nextEvent = async (stream: SseReader, timeoutMs?: number) => {
	for (;;) {
		const message = await stream.next(timeoutMs);
		if (message.comment === undefined) return message;
	}
};
