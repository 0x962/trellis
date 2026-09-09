import { describe, expect, test } from "bun:test";
import { lines, runCli } from "../../test/deps.ts";
import { refusedFetch } from "../../test/fakeServer.ts";
import { bootId, ticketSummary } from "../../test/fixtures.ts";

const frame = (id: string | null, event: string, data: unknown) =>
	`${id === null ? "" : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const ready = (id: string) => frame(id, "ready", { id, bootId, serverVersion: "0.0.0", apiVersion: "0.0.0" });

const updated = (id: string) =>
	frame(id, "ticket.updated", { summary: ticketSummary(), fields: ["title"], batchId: bootId });

// One `text/event-stream` answer whose body is `text`, then the stream ends.
// `beforeClose` runs after the body is queued and before the end, so a test
// fires the abort signal in the middle of a stream.
const sseResponse = (text: string, beforeClose?: () => void) =>
	new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode(text));
				beforeClose?.();
				controller.close();
			},
		}),
		{ status: 200, headers: { "content-type": "text/event-stream" } },
	);

// Answers each connect with the next entry of `answers`; the connect after
// the last entry fires the abort signal, so `watch` returns.
const eventsRoute = (answers: string[]) => {
	const controller = new AbortController();
	let connects = 0;
	const raw = () => {
		const index = connects++;
		if (index >= answers.length) {
			controller.abort();
			return sseResponse("");
		}
		return sseResponse(answers[index]!);
	};
	return { raw, signal: controller.signal };
};

const parsed = (stdout: string) => lines(stdout).map((line) => JSON.parse(line));

describe("watch", () => {
	// CLI-62
	test("watch maps its flags to the events query", async () => {
		const route = eventsRoute([]);
		const result = await runCli(
			["watch", "--project", "CDE", "--ticket", "CDE-42", "--type", "ticket.updated,pr.updated", "--since", "A.5"],
			{},
			{ raw: route.raw, signal: route.signal },
		);
		expect(result.code).toBe(0);
		const request = result.requests[0]!;
		expect(request.method).toBe("GET");
		const url = new URL(request.url);
		expect(`${url.origin}${url.pathname}`).toBe("http://127.0.0.1:4521/api/events");
		expect(Object.fromEntries(url.searchParams)).toEqual({
			project: "CDE",
			ticket: "CDE-42",
			types: "ticket.updated,pr.updated",
			since: "A.5",
		});
		expect(request.headers.get("accept")).toBe("text/event-stream");
		expect(request.headers.get("x-trellis-actor")).toBe("agent:claude-code");
	});

	// CLI-63
	test("watch prints one JSON line per event", async () => {
		const stream =
			ready("A.1") +
			updated("A.2") +
			frame("A.3", "comment.created", { id: "01J8Z6X4Q3M2K1H0G9F8E7D6C1", ticketId: "x" });
		const route = eventsRoute([stream]);
		const result = await runCli(["watch"], {}, { raw: route.raw, signal: route.signal });
		expect(result.code).toBe(0);
		const events = parsed(result.stdout);
		expect(events.map((event) => event.type)).toEqual(["ready", "ticket.updated", "comment.created"]);
		expect(events[1]).toMatchObject({ id: "A.2", type: "ticket.updated", fields: ["title"], batchId: bootId });
		expect(events[1].summary).toEqual(ticketSummary());
		expect(events[2]).toMatchObject({ id: "A.3", type: "comment.created", ticketId: "x" });
	});

	// CLI-64
	test("watch reconnects with Last-Event-ID and backoff", async () => {
		const route = eventsRoute([ready("A.8") + updated("A.9"), ""]);
		const result = await runCli(["watch"], {}, { raw: route.raw, signal: route.signal });
		expect(result.code).toBe(0);
		expect(result.requests).toHaveLength(3);
		expect(result.requests[0]!.headers.get("last-event-id")).toBeNull();
		expect(result.requests[1]!.headers.get("last-event-id")).toBe("A.9");
		expect(result.requests[2]!.headers.get("last-event-id")).toBe("A.9");
		expect(result.sleeps.length).toBeGreaterThanOrEqual(2);
		expect(result.sleeps[0]!).toBeGreaterThan(0);
		expect(result.sleeps[1]!).toBeGreaterThan(result.sleeps[0]!);
	});

	// CLI-65
	test("watch prints reset and continues", async () => {
		const reconnect = frame("B.0", "reset", { reason: "restart" }) + ready("B.1") + updated("B.2");
		const route = eventsRoute([ready("A.1"), reconnect]);
		const result = await runCli(["watch"], {}, { raw: route.raw, signal: route.signal });
		expect(result.code).toBe(0);
		const events = parsed(result.stdout);
		expect(events.map((event) => event.type)).toEqual(["ready", "reset", "ready", "ticket.updated"]);
		expect(events[1]).toMatchObject({ type: "reset", reason: "restart" });
	});

	// CLI-66
	test("watch exits 5 when the server never answers", async () => {
		const result = await runCli(["watch"], {}, { fetch: refusedFetch });
		expect(result.code).toBe(5);
		expect(result.stderr).toBe(
			'error: trellis server not running at http://127.0.0.1:4521; run "trellis install" or "bun dev" (UNREACHABLE)\n',
		);
		expect(result.stdout).toBe("");
	});

	// CLI-67
	test("watch exits 0 on abort", async () => {
		const controller = new AbortController();
		const raw = () => sseResponse(ready("A.1"), () => controller.abort());
		const result = await runCli(["watch"], {}, { raw, signal: controller.signal });
		expect(result.code).toBe(0);
		expect(result.requests).toHaveLength(1);
		expect(parsed(result.stdout).map((event) => event.type)).toEqual(["ready"]);
	});
});
