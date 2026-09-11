import { type ActorRef, type AgentBatchRecord, agentActorName, type TrellisEvent } from "@trellis/api";
import { type Bus, type BusEntry, matches } from "../events/bus.ts";

// The dispatcher queues, per watched project, the changes its manager must
// hear about, and hands each batch to `flush` once. It writes nothing: the
// manager reads the changes themselves from its inbox, so the batch only
// counts them and names the first few.
//
// A batch goes out QUIET_MS after its last change, the timer restarting on
// each change, or at once when BATCH_MAX changes wait. A steady stream of
// edits therefore goes out in batches of BATCH_MAX.

export const QUIET_MS = 10_000;
export const BATCH_MAX = 10;

// The pointer names this many changes and counts the rest.
const NAMED_MAX = 3;

// `recent` keeps this many batches, across every project.
export const RECENT_MAX = 20;

export type DispatcherClock = {
	now: () => Date;
	setTimer: (fn: () => unknown, ms: number) => number;
	clearTimer: (id: number) => void;
};

export type Batch = { projectId: string; count: number; text: string };

// `scope` gives the project and every project below it. `path` gives the
// project ref the manager knows, such as "CDE".
export type DispatcherOptions = {
	bus: Bus;
	clock: DispatcherClock;
	scope: (projectId: string) => string[];
	path: (projectId: string) => string;
	flush: (batch: Batch) => void | Promise<void>;
};

// `recent` gives the last RECENT_MAX batches since the dispatcher started,
// newest first. They live in memory only, so a restart empties the list.
export type Dispatcher = {
	watch: (projectId: string) => void;
	unwatch: (projectId: string) => void;
	stop: () => void;
	watched: () => string[];
	recent: () => AgentBatchRecord[];
};

type Change = { event: TrellisEvent; actor: ActorRef | null };

// The events that change the work on a ticket. The agents events are what
// trellis emits about its own agents, and a project or gh event changes no
// ticket, so none of them wakes a manager.
const TICKET_WORK = new Set<TrellisEvent["type"]>([
	"ticket.created",
	"ticket.updated",
	"ticket.deleted",
	"comment.created",
	"comment.updated",
	"comment.deleted",
	"attachment.created",
	"attachment.deleted",
	"statuses.changed",
]);

const PR_EVENTS = new Set<TrellisEvent["type"]>(["pr.linked", "pr.unlinked", "pr.updated"]);

// A ticket.updated that only moves a count follows the comment or the
// attachment event it counts, so it is the same change.
const COUNT_FIELDS = new Set(["commentCount", "attachmentCount"]);

const isCountEcho = (event: TrellisEvent) =>
	event.type === "ticket.updated" && event.fields.length > 0 && event.fields.every((field) => COUNT_FIELDS.has(field));

const isBuilderOrReviewer = (actor: ActorRef) => actor.kind === "agent" && /^(builder|reviewer)-/.test(actor.name);

// Every change by a person, every PR and CI change, and every change by a
// builder or a reviewer. Never a change by the manager itself, so a manager
// never wakes itself.
const relevant = ({ event, actor }: Change, manager: string) => {
	if (actor !== null && actor.kind === "agent" && actor.name === manager) return false;
	if (PR_EVENTS.has(event.type)) return true;
	if (!TICKET_WORK.has(event.type) || isCountEcho(event) || actor === null) return false;
	return actor.kind === "human" || isBuilderOrReviewer(actor);
};

// One change in words, such as "CDE-42 commented by dana". `names` maps a
// ticket id to the identifier of the last ticket event that named it.
const describe = ({ event, actor }: Change, names: Map<string, string>) => {
	const by = `by ${actor === null ? "trellis" : actor.name}`;
	const name = (ticketId: string) => names.get(ticketId) ?? "a ticket";
	const prTickets = (ticketIds: string[]) => {
		const known = ticketIds.filter((id) => names.has(id)).map(name);
		return known.length === 0 ? "a ticket" : known.join(", ");
	};
	switch (event.type) {
		case "ticket.created":
			return `${event.summary.identifier} created ${by}`;
		case "ticket.updated":
			return event.fields.includes("status")
				? `${event.summary.identifier} moved to ${event.summary.status.name} ${by}`
				: `${event.summary.identifier} updated ${by}`;
		case "ticket.deleted":
			return `${event.summary.identifier} deleted ${by}`;
		case "comment.created":
			return `${name(event.ticketId)} commented ${by}`;
		case "comment.updated":
			return `${name(event.ticketId)} comment edited ${by}`;
		case "comment.deleted":
			return `${name(event.ticketId)} comment deleted ${by}`;
		case "attachment.created":
			return `${name(event.ticketId)} attachment added ${by}`;
		case "attachment.deleted":
			return `${name(event.ticketId)} attachment removed ${by}`;
		case "pr.linked":
			return `PR linked to ${prTickets(event.ticketIds)}`;
		case "pr.unlinked":
			return `PR unlinked from ${prTickets(event.ticketIds)}`;
		case "pr.updated":
			return `PR on ${prTickets(event.ticketIds)} ${event.state}, CI ${event.ciState}`;
		default:
			return `statuses changed ${by}`;
	}
};

// The text the runner types into the manager's terminal. It points at the
// inbox and holds no change itself, so a text that arrives twice or in the
// middle of a turn does no harm.
export const pointerText = (path: string, items: string[]) => {
	const shown = items.slice(0, NAMED_MAX).join(", ");
	const rest = items.length > NAMED_MAX ? `, and ${items.length - NAMED_MAX} more` : "";
	const noun = items.length === 1 ? "change" : "changes";
	return `trellis: ${items.length} ${noun} in ${path} (${shown}${rest}). Run: trellis list --project ${path} --json`;
};

export const createDispatcher = (options: DispatcherOptions): Dispatcher => {
	const watches = new Map<string, { changes: Change[]; timer: number | null }>();
	const names = new Map<string, string>();
	const sent: AgentBatchRecord[] = [];

	const clear = (watch: { timer: number | null }) => {
		if (watch.timer !== null) options.clock.clearTimer(watch.timer);
		watch.timer = null;
	};

	const flush = (projectId: string) => {
		const watch = watches.get(projectId)!;
		clear(watch);
		const items = watch.changes.splice(0).map((change) => describe(change, names));
		const batch = { projectId, count: items.length, text: pointerText(options.path(projectId), items) };
		sent.unshift({ at: options.clock.now().toISOString(), ...batch });
		sent.splice(RECENT_MAX);
		return options.flush(batch);
	};

	const queue = (projectId: string, change: Change) => {
		const watch = watches.get(projectId)!;
		watch.changes.push(change);
		if (watch.changes.length >= BATCH_MAX) {
			void flush(projectId);
			return;
		}
		clear(watch);
		watch.timer = options.clock.setTimer(() => flush(projectId), QUIET_MS);
	};

	const receive = ({ event, actor }: BusEntry) => {
		if (event.type === "ticket.created" || event.type === "ticket.updated" || event.type === "ticket.deleted") {
			names.set(event.summary.id, event.summary.identifier);
		}
		for (const projectId of watches.keys()) {
			const manager = agentActorName({ role: "manager", project: options.path(projectId) });
			const change = { event, actor };
			if (relevant(change, manager) && matches(event, { projectIds: options.scope(projectId) })) {
				queue(projectId, change);
			}
		}
	};

	const unsubscribe = options.bus.subscribe(receive);

	return {
		watch: (projectId) => {
			if (!watches.has(projectId)) watches.set(projectId, { changes: [], timer: null });
		},
		unwatch: (projectId) => {
			const watch = watches.get(projectId);
			if (watch === undefined) return;
			clear(watch);
			watches.delete(projectId);
		},
		stop: () => {
			for (const watch of watches.values()) clear(watch);
			watches.clear();
			unsubscribe();
		},
		watched: () => [...watches.keys()],
		recent: () => [...sent],
	};
};
