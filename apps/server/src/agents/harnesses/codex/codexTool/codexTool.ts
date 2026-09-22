import { z } from "zod";

// The tool of a Codex thread item, in the words of the agent line: a short
// name, and an input that holds only the keys `toolTarget` reads. A Codex
// item can hold a whole diff or a page of search results, so the input
// keeps the target and nothing else. The item itself goes into the output of
// the tool-end event.
export type CodexTool = { name: string; input: Record<string, unknown> };

const commandAction = z.looseObject({ type: z.string(), path: z.string().nullish() });
const codexItems = z.discriminatedUnion("type", [
	z.looseObject({ type: z.literal("commandExecution"), command: z.string(), commandActions: z.array(commandAction) }),
	z.looseObject({ type: z.literal("fileChange"), changes: z.array(z.looseObject({ path: z.string() })) }),
	z.looseObject({ type: z.literal("mcpToolCall"), server: z.string(), tool: z.string(), arguments: z.unknown() }),
	z.looseObject({
		type: z.literal("dynamicToolCall"),
		namespace: z.string().nullable(),
		tool: z.string(),
		arguments: z.unknown(),
	}),
	z.looseObject({
		type: z.literal("webSearch"),
		query: z.string(),
		action: z.looseObject({ query: z.string().nullish(), url: z.string().nullish() }).nullable(),
	}),
	z.looseObject({ type: z.literal("imageView"), path: z.string() }),
	z.looseObject({ type: z.literal("imageGeneration"), revisedPrompt: z.string().nullable() }),
	z.looseObject({ type: z.literal("collabAgentToolCall"), tool: z.string(), prompt: z.string().nullable() }),
	z.looseObject({ type: z.literal("sleep"), durationMs: z.number() }),
	z.looseObject({ type: z.literal("contextCompaction") }),
]);

export const codexToolTypes: ReadonlySet<string> = new Set(codexItems.options.map((option) => option.shape.type.value));

// Codex runs each command through a login shell, for example
// `/bin/zsh -lc 'cat README.md'`, and quotes the script the way a POSIX
// shell reads it. The agent line shows the script that the model wrote.
const shellScript = (command: string) => {
	const script = /^\S*\/(?:ba|z)?sh -lc (.+)$/s.exec(command)?.[1];
	if (script === undefined) return command;
	if (/^'[^']*'$/.test(script)) return script.slice(1, -1);
	if (/^".*"$/s.test(script)) return script.slice(1, -1).replace(/\\(["\\$`])/g, "$1");
	return script;
};

const argumentsInput = (value: unknown): Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

// The name and the input of a Codex tool item. Codex parses each command
// into actions, and a command whose every action reads a file is a file
// read. Every other command is a shell call.
export const codexTool = (item: unknown): CodexTool => {
	const tool = codexItems.parse(item);
	switch (tool.type) {
		case "commandExecution": {
			const reads = tool.commandActions.every((action) => action.type === "read" && action.path);
			return reads && tool.commandActions.length > 0
				? { name: "Read", input: { file_path: tool.commandActions.map((action) => action.path).join(" ") } }
				: { name: "Shell", input: { command: shellScript(tool.command) } };
		}
		case "fileChange":
			return { name: "Edit", input: { file_path: tool.changes.map((change) => change.path).join(" ") } };
		case "mcpToolCall":
			return { name: `mcp__${tool.server}__${tool.tool}`, input: argumentsInput(tool.arguments) };
		case "dynamicToolCall":
			return {
				name: tool.namespace === null ? tool.tool : `${tool.namespace}.${tool.tool}`,
				input: argumentsInput(tool.arguments),
			};
		case "webSearch":
			return {
				name: "WebSearch",
				input: { query: tool.query || (tool.action?.query ?? ""), url: tool.action?.url ?? "" },
			};
		case "imageView":
			return { name: "ViewImage", input: { path: tool.path } };
		case "imageGeneration":
			return { name: "GenerateImage", input: { description: tool.revisedPrompt ?? "" } };
		case "collabAgentToolCall":
			return { name: "Agent", input: { description: tool.prompt ?? tool.tool } };
		case "sleep":
			return { name: "Sleep", input: { description: `${Math.round(tool.durationMs / 1000)} s` } };
		case "contextCompaction":
			return { name: "Compact", input: {} };
	}
};
