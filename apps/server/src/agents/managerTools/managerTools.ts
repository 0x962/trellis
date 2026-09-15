import type { TrellisClient } from "@trellis/api/client";
import { contract } from "@trellis/api/contract";
import { z } from "zod";

const operations = {
	projects: ["list", "get"],
	statuses: ["list"],
	personas: ["list"],
	tickets: ["list", "counts", "get", "create", "update", "move", "updateMany"],
	comments: ["thread", "create", "update", "resolve"],
	timeline: ["list"],
	brief: ["get"],
	pullRequests: ["list", "link", "unlink", "refresh"],
	agentRuns: ["list", "start", "send", "stop", "interrupt", "session", "refresh"],
	flows: ["list", "get"],
	flowExecutions: ["list", "get", "start", "cancel"],
	controller: ["list", "handle"],
} as const;

type Invoke = (operation: string, input: unknown) => Promise<unknown>;
type Procedure = { "~orpc": { inputSchema: z.ZodType; route: { summary?: string } } };

export const managerTools = (invoke: Invoke) => {
	const tools = new Map(
		Object.entries(operations).flatMap(([group, names]) =>
			names.map((action) => {
				const procedure = (contract[group as keyof typeof contract] as unknown as Record<string, Procedure>)[action]!;
				const schema = procedure["~orpc"].inputSchema;
				const name = `trellis_${group}_${action}`;
				return [
					name,
					{
						name,
						operation: `${group}.${action}`,
						description: procedure["~orpc"].route.summary ?? `${group}.${action}`,
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
			const result = await invoke(tool.operation, tool.schema.parse(input));
			if (tool.operation !== "agentRuns.session") return result;
			const session = result as Awaited<ReturnType<TrellisClient["agentRuns"]["session"]>>;
			return session === null
				? null
				: {
						id: session.id,
						status: session.status,
						activity: session.activity,
						result: session.result,
						sessionId: session.agent?.sessionId ?? null,
						turnId: session.agent?.turnId ?? null,
						acknowledgedMessageIds: session.acknowledgedMessageIds,
						outcome: session.agent?.outcome ?? null,
						error: session.agent?.error ?? session.error,
					};
		},
	};
};
