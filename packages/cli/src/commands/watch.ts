import { defineCommand } from "citty";
import { clientOptions, trellisFetch } from "../client.ts";
import { compact, contextOf } from "../context.ts";
import { json } from "../output.ts";
import { readSse } from "../sse.ts";

// The wait before a reconnect doubles on every stream that ends without an
// event, from one second up to thirty.
export const backoff = (failures: number) => Math.min(1000 * 2 ** (failures - 1), 30_000);

// One JSON line per event: the event id and type, then the payload.
const line = (id: string | null, type: string, data: string) => {
	const { id: _id, type: _type, ...payload } = JSON.parse(data) as Record<string, unknown>;
	return json({ id, type, ...payload });
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
				if (!connected) throw error;
				failures++;
				await sleep(backoff(failures));
				continue;
			}
			connected = true;
			try {
				for await (const event of readSse(response.body!)) {
					if (event.id !== null) lastId = event.id;
					failures = 0;
					ctx.out.write(line(event.id, event.event, event.data));
				}
			} catch (error) {
				if (!signal.aborted) throw error;
			}
			if (signal.aborted) return 0;
			failures++;
			await sleep(backoff(failures));
		}
	},
});
