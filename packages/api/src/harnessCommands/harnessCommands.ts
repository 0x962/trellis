import { z } from "zod";

export const HARNESS_VARIABLES = [
	"id",
	"sessionId",
	"resumeText",
	"name",
	"project",
	"ticket",
	"branch",
	"workDir",
	"projectDir",
	"runDir",
	"socket",
	"workspaceId",
	"terminalId",
	"text",
	"prompt",
	"agentCommand",
	"actor",
	"trellisUrl",
	"superset",
	"target",
	"projectId",
	"bun",
] as const;
export const HarnessCommandSchema = z
	.string()
	.trim()
	.min(1, "Enter the command.")
	.max(20000)
	.refine(
		(value) =>
			[...value.matchAll(/\{\{([^{}]+)\}\}/g)].every((match) =>
				(HARNESS_VARIABLES as readonly string[]).includes(match[1]!),
			),
		"The command has an unknown template variable.",
	);
export const HarnessCommandsSchema = z.strictObject({
	start: HarnessCommandSchema,
	resume: HarnessCommandSchema,
	healthcheck: HarnessCommandSchema,
	send: HarnessCommandSchema,
	output: HarnessCommandSchema,
	stop: HarnessCommandSchema,
	open: HarnessCommandSchema,
	recover: HarnessCommandSchema,
	projects: HarnessCommandSchema,
});
export type HarnessCommands = z.infer<typeof HarnessCommandsSchema>;
export const HarnessPlaceSchema = z.object({ workspaceId: z.string().min(1), terminalId: z.string().min(1) });
export const HarnessHealthSchema = z.object({ state: z.enum(["running", "exited"]) });
export const HarnessProjectsSchema = z.array(z.object({ id: z.string(), repo: z.string().nullable().optional() }));

export const HARNESS_FIELDS: { key: keyof HarnessCommands; label: string; hint: string }[] = [
	{ key: "start", label: "Start session", hint: "Start the agent. Print JSON with workspaceId and terminalId." },
	{ key: "resume", label: "Resume session", hint: "Resume the manager. Print JSON with workspaceId and terminalId." },
	{
		key: "healthcheck",
		label: "Healthcheck",
		hint: 'Print JSON with state set to "running" or "exited". A command error preserves the last state.',
	},
	{ key: "send", label: "Send follow-up", hint: "Send {{text}} to the agent. Exit with code 0 on success." },
	{
		key: "output",
		label: "Read output",
		hint: "Print the agent output as text. Trellis saves this output before a stop.",
	},
	{ key: "stop", label: "Stop session", hint: "Stop the agent. Exit with code 0 on success." },
	{ key: "open", label: "Session URL", hint: "Print the URL to open the agent, or print nothing for no link." },
	{
		key: "recover",
		label: "Recover session",
		hint: "Find an interrupted start by {{id}} or {{branch}}. Print JSON with workspaceId and terminalId.",
	},
	{
		key: "projects",
		label: "List repositories",
		hint: "Print a JSON array of {id, repo} records. Trellis matches the repository URL when a command uses {{projectId}}.",
	},
];
