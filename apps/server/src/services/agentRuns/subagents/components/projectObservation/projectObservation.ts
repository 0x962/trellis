import type { AgentSubagentObservation } from "@trellis/api";
import type { RuntimeHarnessObservation } from "@trellis/runtime-protocol";
import { z } from "zod";

const codexResult = z.looseObject({
	type: z.literal("collabAgentToolCall"),
	tool: z.string(),
	status: z.string(),
	prompt: z.string().nullable(),
	receiverThreadIds: z.array(z.string()),
	agentsStates: z.record(z.string(), z.object({ status: z.string(), message: z.string().nullable().optional() })),
});
const claudeInput = z.looseObject({ prompt: z.string().optional() });
const claudeResult = z.looseObject({ agentId: z.string().optional(), agent_id: z.string().optional() });
const text = (value: unknown): string | null =>
	value === undefined ? null : typeof value === "string" ? value : JSON.stringify(value);

export function projectObservation(
	parentRunId: string,
	attemptId: string,
	provider: string,
	observation: RuntimeHarnessObservation,
): AgentSubagentObservation[] {
	const { event, observedAt } = observation;
	const tool = event.tool;
	if (!tool || !["tool-start", "tool-end"].includes(event.kind)) return [];
	const identity = { parentRunId, attemptId, observedAt };
	if (provider === "codex") {
		const parsed = codexResult.safeParse(tool.output);
		if (!parsed.success) return [];
		const output = parsed.data;
		const spawn: AgentSubagentObservation[] =
			output.tool === "spawnAgent"
				? [
						{
							...identity,
							kind: "spawn",
							toolCallId: tool.id,
							provider,
							prompt: output.prompt,
							providerChildIds: output.receiverThreadIds,
							state: output.status === "failed" ? "failed" : "result-recorded",
							output: text(tool.output),
						},
					]
				: [];
		return [
			...spawn,
			...Object.entries(output.agentsStates).map(([providerChildId, state]) => ({
				...identity,
				kind: "status" as const,
				providerChildId,
				state: state.status,
				output: state.message ?? null,
			})),
		];
	}
	if (provider !== "claude" || !["Agent", "Task"].includes(tool.name)) return [];
	const input = claudeInput.safeParse(tool.input);
	const result = claudeResult.safeParse(tool.output);
	const childId = result.success ? (result.data.agentId ?? result.data.agent_id) : undefined;
	return [
		{
			...identity,
			kind: "spawn",
			toolCallId: tool.id,
			provider,
			prompt: input.success ? (input.data.prompt ?? null) : null,
			providerChildIds: childId === undefined ? [] : [childId],
			state: event.error ? "failed" : event.kind === "tool-start" ? "started" : "result-recorded",
			output: event.error ?? text(tool.output),
		},
	];
}
