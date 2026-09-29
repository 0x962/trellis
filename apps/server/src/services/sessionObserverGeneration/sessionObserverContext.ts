import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { chainRows } from "../../db/queries/chainRows.ts";
import { rows } from "../../db/queries/support.ts";
import { ticketGet } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { epicView } from "../epics/epics.ts";
import type { SessionObserverProjectContext } from "./sessionObserverPrompt.ts";

type ObserverRunContext = {
	instruction: string;
	projectId: string | null;
	ticketId: string | null;
};

type ObserverProjectContext = NonNullable<SessionObserverProjectContext["project"]>;

const projectContext = async (tx: Tx, projectId: string | null): Promise<ObserverProjectContext | null> => {
	if (projectId === null) return null;
	const [project] = await rows<ObserverProjectContext>(
		tx,
		sql`SELECT key, name, description FROM projects WHERE id=${projectId}`,
	);
	return project ?? null;
};

export const readSessionObserverContext = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { runId: string },
): Promise<SessionObserverProjectContext> => {
	const [run] = await rows<ObserverRunContext>(
		tx,
		sql`SELECT instruction, project_id AS "projectId", ticket_id AS "ticketId"
			FROM agent_runs WHERE id=${input.runId}`,
	);
	if (run === undefined) throw new Error(`Unknown observer run ${input.runId}.`);
	const project = await projectContext(tx, run.projectId);
	if (run.ticketId === null) return { goal: run.instruction, project, ticket: null, epic: null };

	const ticket = await ticketGet(tx, run.ticketId);
	if (ticket.epic === null) {
		return {
			goal: run.instruction,
			project,
			ticket: {
				identifier: ticket.identifier,
				title: ticket.title,
				description: ticket.description,
				contractResult: ticket.contract.result || null,
			},
			epic: null,
		};
	}

	const epic = await epicView(ctx, tx, ticket.epic.id);
	const priorOutcomes = (await chainRows(tx, ticket.id)).flatMap((item) =>
		item.outcome === "" ? [] : [{ identifier: item.identifier, outcome: item.outcome }],
	);
	return {
		goal: run.instruction,
		project,
		ticket: {
			identifier: ticket.identifier,
			title: ticket.title,
			description: ticket.description,
			contractResult: ticket.contract.result || null,
		},
		epic: {
			name: epic.name,
			description: epic.description,
			priorOutcomes,
		},
	};
};
