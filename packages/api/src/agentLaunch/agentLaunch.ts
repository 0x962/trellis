// The variables of an agent command template: the program that is one
// agent. Trellis names the session and passes it in `sessionId`; the
// template decides what its agent does with it. `prompt` is the full guide
// for a new conversation or the new message for a saved conversation.
// `resumeText` has the same value as `prompt` when Trellis supplies it.
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
export const DEFAULT_AGENT_START_COMMAND =
	"claude --dangerously-skip-permissions -n {{name}} --session-id {{sessionId}} {{prompt}}";
export const DEFAULT_AGENT_RESUME_COMMAND =
	"claude --dangerously-skip-permissions -n {{name}} --resume {{sessionId}} {{resumeText}}";

const unknownVariables = (template: string, known: readonly string[]) =>
	[...template.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1]!).filter((name) => !known.includes(name));

export const unknownAgentCommandVariables = (template: string) => unknownVariables(template, AGENT_COMMAND_VARIABLES);
