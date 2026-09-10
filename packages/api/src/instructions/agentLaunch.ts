import { agentActor, agentTitle } from "./agentNames.ts";

// `url` is the trellis server the agent talks to.
export type AgentLaunchInput = { url: string } & (
	| { role: "manager"; project: string }
	| { role: "builder"; project: string; ticket: string }
	| { role: "reviewer"; project: string; ticket: string; prUrl: string }
);

// `title` names the Superset tab and `actor` is the agent's
// `x-trellis-actor` value. `command` is the shell line the runner passes to
// `superset ws create --command` or `superset terminals create --command`.
export type AgentLaunch = { title: string; actor: string; command: string };

// A POSIX single-quoted word keeps every character. A quote in the value
// closes the word, adds an escaped quote, and opens a new word.
const quote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

const instructionFlags = (input: AgentLaunchInput): string => {
	const flags = ["--role", input.role, "--project", quote(input.project)];
	if (input.role !== "manager") flags.push("--ticket", quote(input.ticket));
	if (input.role === "reviewer") flags.push("--pr", quote(input.prUrl));
	return flags.join(" ");
};

// The only place that builds the command that starts an agent. The prompt
// is the output of `trellis instructions --role`, read when the agent
// starts, so a manager gets the status descriptions of that moment. The
// export comes first because the shell expands `$(...)` before it runs
// claude: the instructions call needs TRELLIS_URL too. The command is one
// line, so a terminal that types it runs it whole.
export const agentLaunch = (input: AgentLaunchInput): AgentLaunch => {
	const title = agentTitle(input);
	const actor = agentActor(input);
	const env = `export TRELLIS_URL=${quote(input.url)} TRELLIS_ACTOR=${quote(actor)}`;
	const claude = `claude -n ${quote(title)} --dangerously-skip-permissions "$(trellis instructions ${instructionFlags(input)})"`;
	return { title, actor, command: `${env} && ${claude}` };
};
