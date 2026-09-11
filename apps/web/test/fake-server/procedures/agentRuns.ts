import type { AgentRun } from "@trellis/api";
import { fail } from "../fail";
import { os } from "../implementer";
import { isoNow, newId, requireProject, requireTicket } from "../state";
export const agentRuns = {
	send: os.agentRuns.send.handler(({ context, input }) => context.state.agentRuns.get(input.id)!),
	output: os.agentRuns.output.handler(() => ({ text: "Agent output" })),
	list: os.agentRuns.list.handler(({ context, input }) =>
		[...context.state.agentRuns.values()]
			.filter(
				(run) =>
					(!input.ticket || run.ticketIdentifier === input.ticket) &&
					(!input.project || run.projectPath === input.project),
			)
			.reverse(),
	),
	start: os.agentRuns.start.handler(({ context, input }) => {
		const persona = context.state.personas.get(input.personaId)!;
		const ticket = input.ticket ? requireTicket(context.state, input.ticket) : null;
		const project = requireProject(context.state, ticket?.projectId ?? input.project!);
		const run: AgentRun = {
			id: newId(),
			name: "Ada Finch",
			runtime: "superset",
			personaId: persona.id,
			personaName: persona.name,
			kind: persona.kind,
			instruction: persona.instruction,
			projectId: project.id,
			projectPath: project.path,
			ticketId: ticket?.id ?? null,
			ticketIdentifier: input.ticket ?? null,
			state: "running",
			workspaceId: "workspace",
			terminalId: "terminal",
			url: "superset://workspace/workspace",
			error: null,
			createdAt: isoNow(),
			updatedAt: isoNow(),
		};
		context.state.agentRuns.set(run.id, run);
		context.bus.emit("agent-runs.changed", { id: run.id });
		return run;
	}),
	stop: os.agentRuns.stop.handler(({ context, input }) => {
		const run = context.state.agentRuns.get(input.id);
		if (!run) throw fail("NOT_FOUND", { kind: "agent", ref: input.id });
		run.state = "stopped";
		context.bus.emit("agent-runs.changed", { id: run.id });
		return run;
	}),
	refresh: os.agentRuns.refresh.handler(({ context, input }) => context.state.agentRuns.get(input.id)!),
};
