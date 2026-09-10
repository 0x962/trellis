import { type RoleName, roleActor, roleTitle } from "./names.ts";

// A POSIX single-quoted word keeps every character. A quote in the value
// closes the word, adds an escaped quote, and opens a new word.
export const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

// `url` is the trellis server the agent talks to.
export type LaunchInput = { url: string } & (
	| { role: "manager"; project: string }
	| { role: "builder"; project: string; ticket: string }
	| { role: "reviewer"; project: string; ticket: string; prUrl: string }
);

const nameOf = (input: LaunchInput): RoleName =>
	input.role === "manager" ? { role: "manager", project: input.project } : { role: input.role, ticket: input.ticket };

// The shell expands `$(...)` before it runs claude, and `trellis
// instructions` needs TRELLIS_URL too, so the export comes first.
const exportLine = (url: string, name: RoleName) =>
	`export TRELLIS_URL=${shellQuote(url)} TRELLIS_ACTOR=${shellQuote(roleActor(name))}`;

const instructionFlags = (input: LaunchInput) => {
	const flags = ["--role", input.role, "--project", shellQuote(input.project)];
	if (input.role !== "manager") flags.push("--ticket", shellQuote(input.ticket));
	if (input.role === "reviewer") flags.push("--pr", shellQuote(input.prUrl));
	return flags.join(" ");
};

// The shell line the runner passes to `superset ws create --command` or
// `superset terminals create --command`. The prompt is the output of
// `trellis instructions --role`, read when the agent starts, so every agent
// of a role gets the same text and a manager gets the status descriptions
// of that moment. The line holds no newline, so a terminal runs it whole.
export const launchCommand = (input: LaunchInput) => {
	const name = nameOf(input);
	const claude = `claude -n ${shellQuote(roleTitle(name))} --dangerously-skip-permissions`;
	return `${exportLine(input.url, name)} && ${claude} "$(trellis instructions ${instructionFlags(input)})"`;
};

export type ResumeInput = { url: string; project: string; sessionId: string; text: string };

// Starts an exited manager again in its Claude session, which keeps its
// conversation, with `text` as the next prompt. A newline in `text` becomes
// a space, so the command stays one line.
export const resumeCommand = (input: ResumeInput) => {
	const name: RoleName = { role: "manager", project: input.project };
	const prompt = input.text.replace(/\s*\n\s*/g, " ");
	const claude = `claude -n ${shellQuote(roleTitle(name))} --dangerously-skip-permissions`;
	return `${exportLine(input.url, name)} && ${claude} --resume ${shellQuote(input.sessionId)} ${shellQuote(prompt)}`;
};

// The wake text after a server start. The manager missed the changes of the
// time the server was down; its inbox holds them.
export const restartText = (project: string) =>
	`trellis: the server restarted. Run: trellis agents inbox --project ${project}`;
