import { TicketImportDependenciesInputSchema, type TicketImportDependenciesOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveEpic } from "../epics/resolve.ts";
import { assertProjectActive } from "../refs.ts";
import { addParsedDependency } from "./deps.ts";

type EpicTicket = {
	id: string;
	identifier: string;
	description: string;
};

const stepNumber = (description: string) => {
	const match = /^Step (\d+)\b/.exec(description);
	return match === null ? null : Number(match[1]);
};

const dependencyText = (description: string) => /^Depends on:\s+(.+)$/im.exec(description)?.[1] ?? "";

const dependencySteps = (text: string) => {
	const match = /\bsteps?\s+((?:\d+\s*,\s*)*\d+)/i.exec(text);
	return match === null ? [] : [...match[1]!.matchAll(/\d+/g)].map(([step]) => Number(step));
};

const ticketRefs = (text: string) =>
	[...text.matchAll(/\b[A-Z][A-Z0-9]{1,9}-\d+\b/gi)].map(([ref]) => ref.toUpperCase());

const identifiersWaitingForThisTicket = (description: string) =>
	ticketRefs(/^Waiting on this answer:\s+(.+)$/im.exec(description)?.[1] ?? "");

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
		sql`SELECT t.id, proj.key || '-' || t.number AS identifier, t.description
			FROM tickets t JOIN projects proj ON proj.id = t.project_id
			WHERE t.epic_id = ${epic.id} ORDER BY t.number`,
	);
	const byIdentifier = new Map(tickets.map((ticket) => [ticket.identifier, ticket]));
	const byStep = new Map<number, EpicTicket>();
	for (const ticket of tickets) {
		const step = stepNumber(ticket.description);
		if (step !== null) byStep.set(step, ticket);
	}

	const ticketsWithUnresolvedReferences = new Set<string>();
	let edgeCount = 0;
	const writeEdge = async (sourceIdentifier: string, waitingTicket: EpicTicket, dependency: EpicTicket) => {
		const result = await addParsedDependency(ctx, tx, waitingTicket, dependency);
		if (result === "cycle") ticketsWithUnresolvedReferences.add(sourceIdentifier);
		if (result === "written") edgeCount += 1;
	};
	for (const ticket of tickets) {
		const dependsOn = dependencyText(ticket.description);
		for (const step of dependencySteps(dependsOn)) {
			const dependency = byStep.get(step);
			if (dependency === undefined) ticketsWithUnresolvedReferences.add(ticket.identifier);
			else await writeEdge(ticket.identifier, ticket, dependency);
		}
		for (const identifier of ticketRefs(dependsOn)) {
			const dependency = byIdentifier.get(identifier);
			if (dependency === undefined) ticketsWithUnresolvedReferences.add(ticket.identifier);
			else await writeEdge(ticket.identifier, ticket, dependency);
		}
		for (const identifier of identifiersWaitingForThisTicket(ticket.description)) {
			const waitingTicket = byIdentifier.get(identifier);
			if (waitingTicket === undefined) ticketsWithUnresolvedReferences.add(ticket.identifier);
			else await writeEdge(ticket.identifier, waitingTicket, ticket);
		}
	}
	return { edgeCount, ticketsWithUnresolvedReferences: [...ticketsWithUnresolvedReferences] };
};
