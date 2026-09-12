import { describe, expect, test } from "bun:test";
import { lines, runCli } from "../../../deps.ts";
import { refusedFetch } from "../../../fakeServer.ts";
import { bootId, commentId, prId, projectId, ticketId, ticketSummary } from "../../../fixtures.ts";

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

// A JSON answer with an error body, the way the events route refuses a
// bad query.
const errorResponse = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// A stream that carries `text` and then fails the way a dropped TCP
// connection fails. The failure comes on the read after the text, so the
// reader sees the text first.
const brokenResponse = (text: string) => {
	let pulls = 0;
	return new Response(
		new ReadableStream<Uint8Array>({
			pull(controller) {
				if (pulls++ === 0) {
					controller.enqueue(new TextEncoder().encode(text));
					return;
				}
				controller.error(Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" }));
			},
		}),
		{ status: 200, headers: { "content-type": "text/event-stream" } },
	);
};

// Answers every connect with `answer` and fires the abort signal on the
// fourth, so a `watch` that reconnects where it must exit still returns.
const boundedRoute = (answer: () => Response) => {
	const controller = new AbortController();
	let connects = 0;
	const raw = () => {
		if (++connects > 3) controller.abort();
		return answer();
	};
	return { raw, signal: controller.signal };
};

const serverErrorBody = { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" };

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

	// CLI-63: `id` is the frame id, which `--since` takes. The row id a
	// payload carries prints as `<kind>Id`, so a line names both the event
	// and the row it is about. The `ready` payload's id is the frame id.
	test("watch keeps the row id of a payload beside the event id", async () => {
		const stream =
			ready("A.1") +
			frame("A.2", "comment.created", { id: commentId, ticketId }) +
			frame("A.3", "project.deleted", { id: projectId }) +
			frame("A.4", "pr.updated", { id: prId, ticketIds: [ticketId], state: "open", ciState: "fail" }) +
			frame("A.5", "statuses.changed", { projectId });
		const route = eventsRoute([stream]);
		const result = await runCli(["watch"], {}, { raw: route.raw, signal: route.signal });
		expect(result.code).toBe(0);
		const events = parsed(result.stdout);
		expect(events[0]).toEqual({ id: "A.1", type: "ready", bootId, serverVersion: "0.0.0", apiVersion: "0.0.0" });
		expect(events[1]).toEqual({ id: "A.2", type: "comment.created", commentId, ticketId });
		expect(events[2]).toEqual({ id: "A.3", type: "project.deleted", projectId });
		expect(events[3]).toEqual({
			id: "A.4",
			type: "pr.updated",
			prId,
			ticketIds: [ticketId],
			state: "open",
			ciState: "fail",
		});
		expect(events[4]).toEqual({ id: "A.5", type: "statuses.changed", projectId });
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

	// CLI-64: a stream that breaks mid-way is a stream that ended, so the
	// next connect follows after the backoff.
	test("watch reconnects when a stream breaks", async () => {
		const controller = new AbortController();
		let connects = 0;
		const raw = () => {
			if (connects++ === 0) return brokenResponse(ready("A.1"));
			controller.abort();
			return sseResponse("");
		};
		const result = await runCli(["watch"], {}, { raw, signal: controller.signal });
		expect(result.code).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.requests).toHaveLength(2);
		expect(result.sleeps).toEqual([1000]);
		expect(parsed(result.stdout).map((event) => event.type)).toEqual(["ready"]);
	});

	// CLI-64: only a connection that fails is retried. A server that answers
	// with an older api on a reconnect exits 7, the same as on the first connect.
	test("watch exits 7 when a reconnect meets an older server", async () => {
		const controller = new AbortController();
		let connects = 0;
		const fetch = async (request: Request) => {
			void request;
			const first = connects++ === 0;
			if (connects > 3) controller.abort();
			const response = sseResponse(first ? ready("A.1") : "");
			response.headers.set("x-trellis-api-version", first ? "1.2.0" : "1.1.0");
			return response;
		};
		const result = await runCli(["watch"], {}, { fetch, apiVersion: "1.2.0", signal: controller.signal });
		expect(result.code).toBe(7);
		expect(connects).toBe(2);
		expect(result.sleeps).toEqual([1000]);
		expect(result.stderr).toEndWith(" (SERVER_OLDER)\n");
		expect(parsed(result.stdout).map((event) => event.type)).toEqual(["ready"]);
	});

	// CLI-66: an error answer on the events route is the contract error it
	// carries, with its exit code, and never a reconnect.
	test("watch exits with the mapped code when the events route refuses", async () => {
		const notFound = { code: "NOT_FOUND", message: "Not found.", data: { kind: "project", ref: "NOPE" } };
		const route = boundedRoute(() => errorResponse(404, notFound));
		const result = await runCli(["watch", "--project", "NOPE"], {}, route);
		expect(result.code).toBe(3);
		expect(result.stderr).toBe("error: No project matches NOPE. (NOT_FOUND)\n");
		expect(result.stdout).toBe("");
		expect(result.requests).toHaveLength(1);
		expect(result.sleeps).toEqual([]);

		const server = await runCli(
			["watch"],
			{},
			boundedRoute(() => errorResponse(500, serverErrorBody)),
		);
		expect(server.code).toBe(1);
		expect(server.stderr).toBe("error: Internal server error (INTERNAL_SERVER_ERROR)\n");
		expect(server.stdout).toBe("");
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
