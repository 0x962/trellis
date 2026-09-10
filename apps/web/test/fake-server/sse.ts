import type { Hono } from "hono";

// One server-sent frame. A comment-only block (`: ping`) is a frame with
// `comment` set and no event.
export type Frame = {
	event?: string;
	id?: string;
	data?: string;
	comment?: string;
};

const parseBlock = (block: string): Frame => {
	const frame: Frame = {};
	const data: string[] = [];
	for (const line of block.split("\n")) {
		if (line.startsWith(":")) {
			frame.comment = line.slice(1).trim();
			continue;
		}
		const colon = line.indexOf(":");
		const field = colon === -1 ? line : line.slice(0, colon);
		const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
		if (field === "event") frame.event = value;
		else if (field === "id") frame.id = value;
		else if (field === "data") data.push(value);
	}
	if (data.length > 0) frame.data = data.join("\n");
	return frame;
};

// Opens the events route over `app.request` and reads it frame by frame.
// `next` resolves with the next frame, or with null when the stream ends.
export const openEvents = async (app: Hono, path = "/api/events", init: RequestInit = {}) => {
	const response = await app.request(path, init);
	if (response.body === null) throw new Error(`no body on ${path}: ${response.status}`);
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const queue: Frame[] = [];
	let done = false;

	const pull = async () => {
		for (;;) {
			const separator = buffer.indexOf("\n\n");
			if (separator !== -1) {
				const block = buffer.slice(0, separator);
				buffer = buffer.slice(separator + 2);
				if (block.trim() !== "") queue.push(parseBlock(block));
				if (queue.length > 0) return;
				continue;
			}
			if (done) return;
			const chunk = await reader.read();
			if (chunk.done) {
				done = true;
				continue;
			}
			buffer += decoder.decode(chunk.value, { stream: true });
		}
	};

	const next = async (): Promise<Frame | null> => {
		if (queue.length === 0) await pull();
		return queue.shift() ?? null;
	};

	// Reads frames until one carries `event`, dropping ping comments.
	const nextEvent = async (): Promise<Frame | null> => {
		for (;;) {
			const frame = await next();
			if (frame === null || frame.event !== undefined) return frame;
		}
	};

	const close = () => reader.cancel();

	return { response, next, nextEvent, close };
};

export const parseData = <T = Record<string, unknown>>(frame: Frame | null): T => {
	if (frame === null || frame.data === undefined) throw new Error("frame carries no data");
	return JSON.parse(frame.data) as T;
};
