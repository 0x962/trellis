import type { RuntimeOutputEvent } from "@trellis/runtime-protocol";
import type { Context } from "hono";
import type { Config } from "../config.ts";
import type { ServiceTransport } from "../db/transport.ts";
import { invalidInput } from "../errors.ts";
import { terminalStreamRuntime } from "./terminalRuntime.ts";

const encoder = new TextEncoder();
const frame = (type: string, data: unknown) => encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
const eventFrame = ({ type, ...data }: RuntimeOutputEvent) => frame(type, data);

export const terminalStreamRoute = (config: Config, transport: ServiceTransport) => async (c: Context) => {
	const attemptId = c.req.query("attemptId");
	if (!attemptId || !/^[a-zA-Z0-9_-]{1,128}$/.test(attemptId))
		throw invalidInput("attemptId", "Use the terminal attempt identifier.");
	const rawOffset = c.req.query("offset") ?? "0";
	const offset = Number(rawOffset);
	if (!/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset))
		throw invalidInput("offset", "Use a non-negative byte offset.");
	const target = (await transport.call(
		"agentRuns.terminalTarget",
		{
			actor: null,
			session: null,
			reqId: c.get("requestId"),
			now: new Date(),
		},
		{
			id: c.req.param("id"),
			expectedTerminalId: attemptId,
			expectedSessionId: c.req.query("sessionId"),
		},
	)) as { terminalId: string; sessionId: string | null };
	const client = await terminalStreamRuntime(config.home);
	const abort = new AbortController();
	const cancel = () => abort.abort();
	if (c.req.raw.signal.aborted) cancel();
	c.req.raw.signal.addEventListener("abort", cancel, { once: true });
	const iterator = client.subscribe(target.terminalId, offset, abort.signal);
	let first: IteratorResult<RuntimeOutputEvent>;
	try {
		first = await iterator.next();
	} catch (error) {
		c.req.raw.signal.removeEventListener("abort", cancel);
		abort.abort();
		throw error;
	}
	let closed = false;
	const cleanup = () => {
		closed = true;
		c.req.raw.signal.removeEventListener("abort", cancel);
		abort.abort();
	};
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			if (!first.done) controller.enqueue(eventFrame(first.value));
		},
		async pull(controller) {
			try {
				const next = await iterator.next();
				if (closed) return;
				if (next.done) {
					cleanup();
					controller.close();
				} else controller.enqueue(eventFrame(next.value));
			} catch (error) {
				if (closed) return;
				controller.enqueue(frame("error", { code: "TERMINAL_STREAM_ERROR", message: (error as Error).message }));
				cleanup();
				controller.close();
			}
		},
		async cancel() {
			cleanup();
			await iterator.return(undefined);
		},
	});
	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
			"x-accel-buffering": "no",
		},
	});
};
