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

export const unknownAgentCommandVariables = (template: string) => unknownVariables(template, AGENT_COMMAND_VARIABLES);
