import type { Project, ProjectSummary, Ticket } from "@trellis/api";
import { EventIdSchema, parseEventId } from "@trellis/api";
import type { Context } from "hono";
import { API_VERSION, type RequestContext } from "../context.ts";
import type { Runtime, ServiceTransport } from "../db/transport.ts";
import { invalidInput } from "../errors.ts";
import type { Bus, BusEntry, BusFilter } from "../events/bus.ts";

// The timers the stream reads. A test hands in a fake clock, so a ping at
// 15 s is proven without a 15 s wait.
export type Clock = {
	now: () => Date;
	setInterval: (fn: () => void, ms: number) => unknown;
	clearInterval: (handle: unknown) => void;
};

export const realClock: Clock = {
	now: () => new Date(),
	setInterval: (fn, ms) => setInterval(fn, ms),
	clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export type EventsRouteOptions = {
	bus: Bus;
	runtime: Runtime;
	transport: ServiceTransport;
	clock: Clock;
};

const DEFAULT_PING_SECONDS = 15;

// `ping` is user input, and the interval timer fires for the life of the
// connection. A value outside whole seconds from 5 to 120 is refused, so a
// typo can never make the timer fire every millisecond.
const pingSecondsOf = (value: string | undefined) => {
	if (value === undefined) return DEFAULT_PING_SECONDS;
	const seconds = /^\d+$/.test(value) ? Number(value) : Number.NaN;
	if (!(seconds >= 5 && seconds <= 120)) throw invalidInput("ping", "Expected whole seconds from 5 to 120.");
	return seconds;
};

const encoder = new TextEncoder();

const frame = (type: string, data: unknown, id?: string) =>
	`${id === undefined ? "" : `id: ${id}\n`}event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

const readCtx = (c: Context): RequestContext => ({
	actor: null,
	session: null,
	reqId: c.get("requestId"),
	now: new Date(),
});

// GET /api/events. `since` or `Last-Event-ID` names the last id the client
// saw; the header wins. The replay of everything after it comes first, or
// `reset` when the bus cannot replay, then `ready`, then every event that
// passes the filters. `types` is a comma list of names or `prefix.*`
// forms. `project` narrows to one project and its descendants, `ticket` to
// one ticket. `ping` is the idle comment interval in seconds.
export const createEventsRoute = ({ bus, runtime, transport, clock }: EventsRouteOptions) => {
	const open = new Set<{ end: (reason: "shutdown") => void }>();

	const filterOf = async (c: Context): Promise<BusFilter> => {
		const filter: BusFilter = {};
		const types = c.req.query("types");
		if (types !== undefined) filter.types = types.split(",");
		const project = c.req.query("project");
		if (project !== undefined) {
			const root = (await transport.call("projects.get", readCtx(c), { project })) as Project;
			const all = (await transport.call("projects.list", readCtx(c), {})) as ProjectSummary[];
			filter.projectIds = all
				.filter((item) => item.path === root.path || item.path.startsWith(`${root.path}.`))
				.map((item) => item.id);
		}
		const ticket = c.req.query("ticket");
		if (ticket !== undefined) {
			const row = (await transport.call("tickets.get", readCtx(c), { ticket })) as Ticket;
			filter.ticketIds = [row.id];
		}
		return filter;
	};

	const handler = async (c: Context) => {
		const since = c.req.header("last-event-id") ?? c.req.query("since");
		if (since !== undefined && !EventIdSchema.safeParse(since).success) {
			throw invalidInput("since", "Expected an event id: <bootId ULID>.<seq>.");
		}
		const pingMs = pingSecondsOf(c.req.query("ping")) * 1000;
		const filter = await filterOf(c);
		let cleanup = () => {};

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				const write = (text: string) => controller.enqueue(encoder.encode(text));
				const send = (entry: BusEntry) => {
					const { type, ...data } = entry.event;
					write(frame(type, data, entry.id));
				};
				if (since !== undefined) {
					const replay = bus.since(since, filter);
					if (replay === null) {
						write(frame("reset", { reason: parseEventId(since).bootId === bus.bootId ? "gap" : "restart" }));
					} else {
						for (const entry of replay) send(entry);
					}
				}
				// `ready` carries the newest event id as its frame id, so a
				// reconnect or a `--since` from it replays the next event. Before
				// the first event of this boot the frame has no id: the id
				// `<bootId>.0` names the first event, and a replay after it skips
				// that event.
				const newest = bus.tip();
				const tip = newest ?? `${bus.bootId}.0`;
				const ready = { id: tip, bootId: bus.bootId, serverVersion: runtime.version, apiVersion: API_VERSION };
				write(frame("ready", ready, newest ?? undefined));
				const unsubscribe = bus.subscribe(send, filter);
				const timer = clock.setInterval(() => write(": ping\n\n"), pingMs);
				const connection = {
					end: (reason: "shutdown") => {
						write(frame("bye", { reason }));
						cleanup();
						controller.close();
					},
				};
				cleanup = () => {
					unsubscribe();
					clock.clearInterval(timer);
					open.delete(connection);
				};
				open.add(connection);
			},
			cancel() {
				cleanup();
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

	// Tells every open stream the server is going away and closes it.
	const bye = (reason: "shutdown") => {
		for (const connection of [...open]) connection.end(reason);
	};

	return { handler, bye, openCount: () => open.size };
};
