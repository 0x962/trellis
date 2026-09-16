import { AgentRunListInputSchema } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { contract } from "@trellis/api/contract";
import { z } from "zod";
import { sessionDetails, sessionInput } from "./sessionDetails.ts";

const operations = {
	submanagers: ["list", "start", "resize", "retire"],
	projects: ["list", "get"],
	harnessAccounts: ["list", "quota"],
	statuses: ["list"],
	personas: ["list", "get"],
	tickets: ["list", "counts", "get", "create", "update", "move", "updateMany"],
	comments: ["thread", "create", "update", "resolve"],
	chat: ["channels", "createChannel", "list", "post", "attachment"],
	notes: ["list", "get", "create", "update", "delete"],
	timeline: ["list"],
	brief: ["get"],
	pullRequests: ["list", "link", "unlink", "refresh"],
	agentRuns: ["list", "start", "resume", "setModel", "send", "stop", "interrupt", "session", "refresh"],
	flows: ["list", "get"],
	flowExecutions: ["list", "get", "start", "cancel"],
	controller: ["list", "handle", "actions", "cancelAction"],
} as const;

const agentListInput = AgentRunListInputSchema.extend({
	limit: z.number().int().min(1).max(20).default(10),
	offset: z.number().int().nonnegative().default(0),
});

type Invoke = (operation: string, input: unknown) => Promise<unknown>;
type Procedure = { "~orpc": { inputSchema: z.ZodType; route: { summary?: string } } };
type AgentRun = Awaited<ReturnType<TrellisClient["agentRuns"]["start"]>>;
const assignmentRecord = ({ instruction: _instruction, state: _state, ...record }: AgentRun) => ({
	...record,
	working:
		record.processStatus === "running" &&
		record.observation?.controllable === true &&
		record.observation.activity?.state === "working" &&
		record.observation.outcome === null,
	replacementAllowed: record.processStatus === "exited" || (record.runtime === "native" && record.terminalId === null),
});

export const managerTools = (invoke: Invoke) => {
	const tools = new Map(
		Object.entries(operations).flatMap(([group, names]) =>
			names.map((action) => {
				const procedure = (contract[group as keyof typeof contract] as unknown as Record<string, Procedure>)[action]!;
				const paginated = group === "agentRuns" && action === "list";
				const inspect = group === "agentRuns" && action === "session";
				const schema = paginated ? agentListInput : inspect ? sessionInput : procedure["~orpc"].inputSchema;
				const name = `trellis_${group}_${action}`;
				return [
					name,
					{
						name,
						operation: `${group}.${action}`,
						description: paginated
							? "List agents in pages. Returns items, total, and nextOffset."
							: inspect
								? "Inspect agent activity. Request optional include fields: model, tool, lastTool (with input and output), lastMessage, result, error, process."
								: (procedure["~orpc"].route.summary ?? `${group}.${action}`),
						schema,
						inputSchema: z.toJSONSchema(schema, { io: "input" }),
					},
				] as const;
			}),
		),
	);
	return {
		list: () => [...tools.values()].map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
		async call(name: string, input: unknown) {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Unknown manager tool: ${name}`);
			if (tool.operation === "agentRuns.list") {
				const { limit, offset, ...filters } = agentListInput.parse(input);
				const runs = (await invoke(tool.operation, filters)) as AgentRun[];
				const items = runs.slice(offset, offset + limit).map(assignmentRecord);
				return {
					items,
					total: runs.length,
					nextOffset: offset + items.length < runs.length ? offset + items.length : null,
				};
			}
			const parsed = tool.schema.parse(input);
			const result = await invoke(
				tool.operation,
				tool.operation === "agentRuns.session" ? { id: (parsed as { id: string }).id } : parsed,
			);
			// The full instruction of every persona is too long for one tool
			// result, so the list carries names only and personas.get reads one.
			if (tool.operation === "personas.list")
				return (result as { instruction: string }[]).map(({ instruction: _instruction, ...persona }) => persona);
			if (
				[
					"submanagers.start",
					"agentRuns.start",
					"agentRuns.resume",
					"agentRuns.setModel",
					"agentRuns.send",
					"agentRuns.stop",
					"agentRuns.refresh",
				].includes(tool.operation)
			)
				return assignmentRecord(result as AgentRun);
			if (tool.operation !== "agentRuns.session") return result;
			const { include } = sessionInput.parse(input);
			const session = result as Awaited<ReturnType<TrellisClient["agentRuns"]["session"]>>;
			if (session === null) {
				const runs = (await invoke("agentRuns.list", {})) as AgentRun[];
				const run = runs.find((run) => run.id === (input as { id: string }).id);
				return {
					status: "unknown",
					checkedAt: null,
					controllable: false,
					working: false,
					replacementAllowed: run?.runtime === "native" && run.terminalId === null,
					activity: null,
					...sessionDetails(null, include, run?.error ?? "The execution service has no live record of this attempt."),
				};
			}
			return {
				status: session.status,
				checkedAt: session.checkedAt,
				controllable: session.controllable,
				working:
					session.status === "running" &&
					session.controllable &&
					session.activity?.state === "working" &&
					session.agent?.outcome == null,
				replacementAllowed: session.status === "exited",
				activity: session.activity,
				outcome: session.agent?.outcome ?? null,
				...sessionDetails(session, include),
			};
		},
	};
};
