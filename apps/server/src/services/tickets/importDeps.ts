import { TicketImportDependenciesInputSchema, type TicketImportDependenciesOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveEpic } from "../epics/resolve.ts";
import { assertProjectActive } from "../refs.ts";

type EpicTicket = {
	id: string;
	identifier: string;
	description: string;
};

const stepNumber = (description: string) => {
	const match = /^Step (\d+) of the routine runtime\b/.exec(description);
	return match === null ? null : Number(match[1]);
};

const dependencySteps = (description: string) => {
	const match = /^Depends on:\s+steps?\s+((?:\d+\s*,\s*)*\d+)/im.exec(description);
	return match === null ? [] : [...match[1]!.matchAll(/\d+/g)].map(([step]) => Number(step));
};

const answerTickets = (description: string) => {
	const match = /^Waiting on this answer:\s+(.+)$/im.exec(description);
	return match === null
		? []
		: [...match[1]!.matchAll(/\b[A-Z][A-Z0-9]{1,9}-\d+\b/gi)].map(([ref]) => ref.toUpperCase());
};

export const importDependencies = async (
	ctx: ServiceCtx,
	tx: Tx,
	rawInput: unknown,
): Promise<TicketImportDependenciesOutput> => {
	const input = TicketImportDependenciesInputSchema.parse(rawInput);
	const epic = await resolveEpic(ctx, tx, input.epic);
	assertProjectActive(ctx, epic.project_id);
	const tickets = await rows<EpicTicket>(
		tx,
		sql`SELECT t.id, root.key || '-' || t.number AS identifier, t.description
			FROM tickets t JOIN projects root ON root.id = t.root_id
			WHERE t.epic_id = ${epic.id} ORDER BY t.number`,
	);
	const byIdentifier = new Map(tickets.map((ticket) => [ticket.identifier, ticket]));
	const byStep = new Map<number, EpicTicket>();
	for (const ticket of tickets) {
		const step = stepNumber(ticket.description);
		if (step !== null) byStep.set(step, ticket);
	}

	const unresolved = new Set<string>();
	const edges = new Map<string, { ticketId: string; dependsOnId: string }>();
	const addEdge = (ticket: EpicTicket, dependency: EpicTicket) => {
		edges.set(`${ticket.id}:${dependency.id}`, { ticketId: ticket.id, dependsOnId: dependency.id });
	};
	for (const ticket of tickets) {
		for (const step of dependencySteps(ticket.description)) {
			const dependency = byStep.get(step);
			if (dependency === undefined) unresolved.add(ticket.identifier);
			else addEdge(ticket, dependency);
		}
		for (const ref of answerTickets(ticket.description)) {
			const target = byIdentifier.get(ref);
			if (target === undefined) unresolved.add(ticket.identifier);
			else addEdge(target, ticket);
		}
	}

	let edgeCount = 0;
	for (const edge of edges.values()) {
		const changed = await rows<unknown>(
			tx,
			sql`INSERT INTO ticket_deps (ticket_id, depends_on_id, source, created_at)
				VALUES (${edge.ticketId}, ${edge.dependsOnId}, 'parsed', ${ctx.now})
				ON CONFLICT (ticket_id, depends_on_id) DO UPDATE
				SET source = 'parsed', created_at = ${ctx.now}
				WHERE ticket_deps.source = 'derived'
				RETURNING ticket_id`,
		);
		edgeCount += changed.length;
	}
	return { edgeCount, unresolved: [...unresolved] };
};
