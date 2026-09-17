import { type ActorRef, formatEventId, parseEventId, type TrellisEvent } from "@trellis/api";

// `actor` is the actor of the call whose commit emitted the event, and null
// for an event that no call made, such as a poller change. It stays inside
// the process: the SSE stream sends the event alone.
export type BusEntry = { id: string; seq: number; event: TrellisEvent; actor: ActorRef | null };

// `types` holds exact event names and `prefix.*` forms. `projectIds` and
// `ticketIds` hold the rows an SSE client scoped to. An event passes a scope
// filter when it names one of those rows, or when it names no row at all
// (`gh.status`). An event that names a row of the other kind only is dropped.
export type BusFilter = {
	types?: string[];
	projectIds?: string[];
	ticketIds?: string[];
	prIds?: string[];
};

export type Subscriber = (entry: BusEntry) => void;

type Scope = { projectIds: string[]; ticketIds: string[] };

const RING_SIZE = 1000;

const scopeOf = (event: TrellisEvent): Scope => {
	switch (event.type) {
		case "ticket.created":
		case "ticket.updated":
		case "ticket.deleted":
			return { projectIds: [event.summary.project.id], ticketIds: [event.summary.id] };
		case "reviews.changed":
		case "pr.linked":
		case "pr.unlinked":
		case "pr.updated":
			return { projectIds: event.projectIds ?? [], ticketIds: event.ticketIds };
		case "comment.created":
		case "comment.updated":
		case "comment.deleted":
		case "attachment.created":
		case "attachment.deleted":
			return { projectIds: event.projectId === undefined ? [] : [event.projectId], ticketIds: [event.ticketId] };
		case "statuses.changed":
		case "chat.message":
		case "chat.delivery":
		case "chat.channels":
			return { projectIds: [event.projectId], ticketIds: [] };
		case "project.created":
		case "project.updated":
		case "project.deleted":
		case "project.moved":
			return { projectIds: [event.id], ticketIds: [] };
		default:
			return { projectIds: [], ticketIds: [] };
	}
};

const matchesType = (type: string, pattern: string) =>
	pattern.endsWith(".*") ? type.startsWith(pattern.slice(0, -1)) : type === pattern;

const intersects = (wanted: string[], scoped: string[]) => scoped.some((id) => wanted.includes(id));

export const matches = (event: TrellisEvent, filter: BusFilter) => {
	if (filter.types !== undefined && !filter.types.some((pattern) => matchesType(event.type, pattern))) return false;
	if (event.type === "reviews.changed") {
		if (filter.prIds && !filter.prIds.includes(event.id)) return false;
		if (filter.projectIds && !intersects(filter.projectIds, event.projectIds)) return false;
		if (filter.ticketIds && !intersects(filter.ticketIds, event.ticketIds)) return false;
		return true;
	}
	if (filter.prIds !== undefined && ["pr.linked", "pr.unlinked", "pr.updated"].includes(event.type)) {
		if (!filter.prIds.includes((event as { id: string }).id)) return false;
	}
	const scope = scopeOf(event);
	const unscoped = scope.projectIds.length === 0 && scope.ticketIds.length === 0;
	if (unscoped) return true;
	if (filter.projectIds !== undefined && !intersects(filter.projectIds, scope.projectIds)) return false;
	if (filter.ticketIds !== undefined && !intersects(filter.ticketIds, scope.ticketIds)) return false;
	return true;
};

// The in-process event stream. Every event gets the id `<bootId>.<seq>`,
// reaches every subscriber whose filter it passes, and stays in a ring of
// the last 1000 entries. `since(id)` replays the entries after `id`. It
// returns null when `id` is from another boot, or when the entry after it
// fell out of the ring. The SSE route then sends `reset`.
export const createBus = ({ bootId }: { bootId: string }) => {
	const ring: BusEntry[] = [];
	const subscribers = new Map<symbol, { fn: Subscriber; filter: BusFilter }>();
	let nextSeq = 0;

	const emit = (event: TrellisEvent, actor: ActorRef | null = null): BusEntry => {
		const seq = nextSeq;
		nextSeq += 1;
		const entry: BusEntry = { id: formatEventId({ bootId, seq }), seq, event, actor };
		ring.push(entry);
		if (ring.length > RING_SIZE) ring.shift();
		for (const { fn, filter } of subscribers.values()) {
			if (matches(event, filter)) fn(entry);
		}
		return entry;
	};

	const subscribe = (fn: Subscriber, filter: BusFilter = {}) => {
		const key = Symbol("subscriber");
		subscribers.set(key, { fn, filter });
		return () => {
			subscribers.delete(key);
		};
	};

	const since = (id: string, filter: BusFilter = {}): BusEntry[] | null => {
		const parsed = parseEventId(id);
		if (parsed.bootId !== bootId) return null;
		const first = parsed.seq + 1;
		const floor = ring[0]?.seq ?? nextSeq;
		if (first < floor) return null;
		return ring.filter((entry) => entry.seq >= first && matches(entry.event, filter));
	};

	// The id of the newest entry. Null until the first event of this boot.
	const tip = () => ring.at(-1)?.id ?? null;

	return { bootId, emit, subscribe, since, tip };
};

export type Bus = ReturnType<typeof createBus>;
