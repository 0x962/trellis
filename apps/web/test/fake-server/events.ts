import { type EventName, type EventPayload, formatEventId, parseEventId } from "@trellis/api";
import { findTicket, type State, subtree } from "./state";

// One emitted event with the ids the scope filters read.
export type EventEntry = {
	seq: number;
	type: EventName;
	data: unknown;
	ticketId: string | null;
	projectId: string | null;
};

export type Scope = { ticketId?: string | null; projectId?: string | null };

type Filter = {
	types: string[] | null;
	projectIds: Set<string> | null;
	ticketId: string | null;
};

type Subscriber = {
	filter: Filter;
	write: (text: string) => void;
	end: () => void;
};

// The events route keeps the last 1000 events for replay.
export const ringSize = 1000;

const encoder = new TextEncoder();

const frame = (type: string, id: string, data: unknown) =>
	`event: ${type}\nid: ${id}\ndata: ${JSON.stringify(data)}\n\n`;

// `ticket.*` matches every type with that prefix.
const typeMatches = (patterns: string[], type: string) =>
	patterns.some((pattern) => (pattern.endsWith(".*") ? type.startsWith(pattern.slice(0, -1)) : pattern === type));

const entryMatches = (filter: Filter, entry: EventEntry) => {
	if (filter.types !== null && !typeMatches(filter.types, entry.type)) return false;
	if (filter.projectIds !== null && (entry.projectId === null || !filter.projectIds.has(entry.projectId))) return false;
	if (filter.ticketId !== null && entry.ticketId !== filter.ticketId) return false;
	return true;
};

export type EventBus = ReturnType<typeof createEventBus>;

// The stream every change lands on. Event ids are `<bootId>.<seq>`; a
// connection that resumes with an id from another boot gets `reset`, one
// below the ring floor gets `reset` too, and one inside the ring gets the
// missed events before `ready`. `: ping` keeps an idle stream open.
export const createEventBus = (
	state: State,
	bootId: string,
	pingMs: number,
	versions: { server: string; api: string },
) => {
	const ring: EventEntry[] = [];
	let seq = 0;
	const subscribers = new Set<Subscriber>();

	const currentId = () => formatEventId({ bootId, seq });

	const emit = <N extends EventName>(type: N, data: EventPayload<N>, scope: Scope = {}) => {
		seq += 1;
		const entry: EventEntry = {
			seq,
			type,
			data,
			ticketId: scope.ticketId ?? null,
			projectId: scope.projectId ?? null,
		};
		ring.push(entry);
		if (ring.length > ringSize) ring.shift();
		for (const subscriber of subscribers) {
			if (entryMatches(subscriber.filter, entry))
				subscriber.write(frame(type, formatEventId({ bootId, seq: entry.seq }), data));
		}
	};

	const parseFilter = (url: URL): Filter => {
		const types = url.searchParams.get("types");
		const project = url.searchParams.get("project");
		const ticket = url.searchParams.get("ticket");
		const root =
			project === null
				? null
				: [...state.projects.values()].find(
						(row) => row.path === project.toUpperCase() || row.path === canonicalPath(project) || row.id === project,
					);
		return {
			types: types === null ? null : types.split(","),
			projectIds: root === undefined || root === null ? null : new Set(subtree(state, root.id).map((row) => row.id)),
			ticketId: ticket === null ? null : (findTicket(state, ticket.toUpperCase())?.id ?? null),
		};
	};

	const handle = (request: Request): Response => {
		const url = new URL(request.url);
		const filter = parseFilter(url);
		const since = request.headers.get("last-event-id") ?? url.searchParams.get("since");
		let subscriber: Subscriber | null = null;
		let ping: ReturnType<typeof setInterval> | null = null;
		const stream = new ReadableStream<Uint8Array>({
			start: (controller) => {
				const write = (text: string) => controller.enqueue(encoder.encode(text));
				if (since !== null) {
					const resume = parseEventId(since);
					const floor = ring[0]?.seq ?? seq + 1;
					if (resume.bootId !== bootId) write(frame("reset", currentId(), { reason: "restart" }));
					else if (resume.seq < floor - 1) write(frame("reset", currentId(), { reason: "gap" }));
					else {
						for (const entry of ring) {
							if (entry.seq > resume.seq && entryMatches(filter, entry)) {
								write(frame(entry.type, formatEventId({ bootId, seq: entry.seq }), entry.data));
							}
						}
					}
				}
				write(
					frame("ready", currentId(), {
						id: currentId(),
						bootId,
						serverVersion: versions.server,
						apiVersion: versions.api,
					}),
				);
				ping = setInterval(() => write(": ping\n\n"), pingMs);
				subscriber = {
					filter,
					write,
					end: () => {
						if (ping !== null) clearInterval(ping);
						controller.close();
					},
				};
				subscribers.add(subscriber);
			},
			cancel: () => {
				if (ping !== null) clearInterval(ping);
				if (subscriber !== null) subscribers.delete(subscriber);
			},
		});
		return new Response(stream, {
			headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
		});
	};

	// Sends `bye` to every open stream and closes it.
	const shutdown = async () => {
		for (const subscriber of subscribers) {
			subscriber.write(frame("bye", currentId(), { reason: "shutdown" }));
			subscriber.end();
		}
		subscribers.clear();
	};

	return { emit, handle, shutdown, currentId, bootId };
};

// `cde.web` and `CDE/web` both name `CDE.web`.
const canonicalPath = (ref: string) => {
	const [key, ...slugs] = ref.split(/[./]/);
	return [key!.toUpperCase(), ...slugs.map((slug) => slug.toLowerCase())].join(".");
};
