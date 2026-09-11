export const DEFAULT_AGENT_LAUNCH_COMMAND =
	"{{superset}} ws create --local --project {{projectId}} --name {{name}} --branch {{branch}} --command {{agentCommand}} --json";
export const AGENT_LAUNCH_VARIABLES = [
	"superset",
	"workDir",
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
] as const;
export const unknownLaunchVariables = (template: string) =>
	[...template.matchAll(/\{\{([^{}]+)\}\}/g)]
		.map((match) => match[1]!)
		.filter((name) => !(AGENT_LAUNCH_VARIABLES as readonly string[]).includes(name));
