export const DEFAULT_AGENT_LAUNCH_COMMAND =
	"{{superset}} ws create {{target}} --project {{projectId}} --name {{name}} --branch {{branch}} --command {{agentCommand}} --json";
// The variables of an ADE command template: the command that makes a
// workspace and runs an agent in it, or opens an agent again in the
// workspace a run has. `agentCommand` is the whole agent command for this
// start, a new session or a resume. `sessionId` is the session of the run,
// and `workspaceId` is the workspace the run has, or empty on a first start.
export const AGENT_LAUNCH_VARIABLES = [
	"superset",
	"target",
	"workDir",
	"projectDir",
	"concurrency",
	"projectId",
	"project",
	"ticket",
	"name",
	"branch",
	"instruction",
	"prompt",
	"actor",
	"trellisUrl",
	"agentCommand",
	"sessionId",
	"workspaceId",
] as const;

// The variables of an agent command template: the program that is one
// agent. trellis names the session and passes it in `sessionId`; the
// template decides what its agent does with it. `prompt` is the whole
// assignment of a new session, and `resumeText` is what a resumed agent
// reads first.
export const AGENT_COMMAND_VARIABLES = [
	"id",
	"workspaceId",
	"terminalId",
	"name",
	"prompt",
	"sessionId",
	"resumeText",
	"actor",
	"trellisUrl",
	"directory",
	"project",
	"ticket",
	"instruction",
] as const;

// The agent commands a project runs when it names none: Claude Code, which
// takes the session id of the run on a new start and resumes it after a
// pause.
export const DEFAULT_AGENT_START_COMMAND = "claude -n {{name}} --session-id {{sessionId}} {{prompt}}";
export const DEFAULT_AGENT_RESUME_COMMAND = "claude -n {{name}} --resume {{sessionId}} {{resumeText}}";

const unknownVariables = (template: string, known: readonly string[]) =>
	[...template.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1]!).filter((name) => !known.includes(name));

export const unknownLaunchVariables = (template: string) => unknownVariables(template, AGENT_LAUNCH_VARIABLES);
export const unknownAgentCommandVariables = (template: string) => unknownVariables(template, AGENT_COMMAND_VARIABLES);

export const hasStandaloneLaunchHyphen = (template: string) =>
	template.includes("{{superset}}") && /(?:^|\s)(?:-|'-'|"-")(?=\s|$)/.test(template);
