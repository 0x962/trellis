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

export type ResumeInput = { url: string; project: string; sessionId: string; text: string };

// Starts an exited manager again in its Claude session, which keeps its
// conversation, with `text` as the next prompt. A newline in `text` becomes
// a space, so the command stays one line.
export const resumeCommand = (input: ResumeInput): string => {
	const name = { role: "manager", project: input.project } as const;
	const prompt = input.text.replace(/\s*\n\s*/g, " ");
	const env = `export TRELLIS_URL=${quote(input.url)} TRELLIS_ACTOR=${quote(agentActor(name))}`;
	const claude = `claude -n ${quote(agentTitle(name))} --dangerously-skip-permissions`;
	return `${env} && ${claude} --resume ${quote(input.sessionId)} ${quote(prompt)}`;
};

// The wake text after a server start. The manager missed the changes of the
// time the server was down; its inbox holds them.
export const restartText = (project: string): string =>
	`trellis: the server restarted. Run: trellis agents inbox --project ${project}`;
