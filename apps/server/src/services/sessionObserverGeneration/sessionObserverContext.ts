import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { getRun } from "../agentRuns/index.ts";
import { epicView } from "../epics/epics.ts";
import * as projects from "../projects.ts";
import * as tickets from "../tickets.ts";
import type { SessionObserverProjectContext } from "./sessionObserverPrompt.ts";

type ObserverProjectContext = NonNullable<SessionObserverProjectContext["project"]>;

const projectContext = async (
	ctx: ServiceCtx,
	tx: Tx,
	projectId: string | null,
): Promise<ObserverProjectContext | null> => {
	if (projectId === null) return null;
	const { key, name, description } = await projects.get(ctx, tx, { project: projectId });
	return { key, name, description };
};

export const readSessionObserverContext = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { runId: string },
): Promise<SessionObserverProjectContext> => {
	const run = await getRun(tx, input.runId);
	const project = await projectContext(ctx, tx, run.projectId);
	if (run.ticketId === null) return { goal: run.instruction, project, ticket: null, epic: null };

	const ticket = await tickets.get(ctx, tx, { ticket: run.ticketId });
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
	const priorOutcomes = await tickets.readDependencyOutcomes(ctx, tx, { ticketId: ticket.id });
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
