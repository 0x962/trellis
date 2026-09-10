import { defineCommand } from "citty";
import { clientOptions, throwErrorAnswer, trellisFetch } from "../client.ts";
import { compact, contextOf } from "../context.ts";
import { CliFailure } from "../errors.ts";
import { json } from "../output.ts";
import { readSse, type SseEvent } from "../sse.ts";

// The wait before a reconnect doubles on every stream that ends without an
// event, from one second up to thirty.
export const backoff = (failures: number) => Math.min(1000 * 2 ** (failures - 1), 30_000);

// One JSON line per event. `id` is the frame id, which `--since` takes. A
// payload `id` names the row the event is about, so it prints as `<kind>Id`
// with kind the first segment of the type: `comment.created` prints
// `commentId`. The `ready` payload's `id` is the frame id and prints once.
const line = (id: string | null, type: string, data: string) => {
	const { id: rowId, type: _type, ...payload } = JSON.parse(data) as Record<string, unknown>;
	const row = rowId === undefined || type === "ready" ? {} : { [`${type.split(".")[0]}Id`]: rowId };
	return json({ id, type, ...row, ...payload });
};

// The next frame, or undefined when the stream ends or breaks. A broken
// connection is an ended stream: the caller reconnects either way.
const nextFrame = async (frames: AsyncGenerator<SseEvent>): Promise<SseEvent | undefined> => {
	try {
		const next = await frames.next();
		return next.done ? undefined : next.value;
	} catch {
		return undefined;
	}
};

export default defineCommand({
	meta: { name: "watch", description: "Print events as JSON lines" },
	args: {
		project: { type: "string", description: "Only events under this project" },
		ticket: { type: "string", description: "Only events on this ticket" },
		type: { type: "string", description: "Event types, comma-separated, with * as a wildcard" },
		since: { type: "string", description: "Replay from this event id" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const { signal, sleep } = ctx.deps;
		const fetch = trellisFetch(clientOptions(ctx));
		const params = new URLSearchParams(
			compact({ project: args.project, ticket: args.ticket, types: args.type, since: args.since }),
		);
		const url = `${ctx.url}/api/events${params.size === 0 ? "" : `?${params}`}`;
		let lastId: string | null = null;
		let connected = false;
		let failures = 0;
		while (true) {
			const headers: Record<string, string> = { accept: "text/event-stream" };
			if (lastId !== null) headers["last-event-id"] = lastId;
			let response: Response;
			try {
				response = await fetch(new Request(url, { headers, signal }), {});
			} catch (error) {
				if (signal.aborted) return 0;
				// Only a connection that fails is retried, and only after one
				// succeeded. An older server or an error answer exits at once.
				const retry = connected && error instanceof CliFailure && error.code === "UNREACHABLE";
				if (!retry) throw error;
				failures++;
				await sleep(backoff(failures));
				continue;
			}
			if (!response.ok) await throwErrorAnswer(response);
			connected = true;
			const frames = readSse(response.body!);
			for (let event = await nextFrame(frames); event !== undefined; event = await nextFrame(frames)) {
				if (event.id !== null) lastId = event.id;
				failures = 0;
				ctx.out.write(line(event.id, event.event, event.data));
			}
			if (signal.aborted) return 0;
			failures++;
			await sleep(backoff(failures));
		}
	},
});
