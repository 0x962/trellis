#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { failingPrUrl } from "../ghReplies";

// A simulated agent for the e2e suite. superset.ts starts it with the
// command that the server passed to `superset ws create --command` or
// `superset terminals create --command`, in TRELLIS_SIM_COMMAND. The role,
// the actor, the project, and the ticket come from that command, so the
// simulation acts on what the server launched and nothing else.
//
// Mode "start" is the first turn of an agent. Mode "wake" is one more turn of
// a manager after text reached its terminal. Every trellis call runs the real
// CLI as the actor that the command exports, so the server gets the same
// requests that a real agent sends. The rules are a small subset of the
// manager prompt in packages/api/src/instructions/manager.ts.

type Role = "manager" | "builder" | "reviewer";
type Session = { role: Role; state: string; workspaceId: string | null; terminalId: string | null };
type InboxTicket = { id: string; identifier: string; status: { slug: string } };
type InboxComment = { ticketId: string; body: string; actor: { kind: string; name: string } };
type Inbox = { tickets: InboxTicket[]; comments: InboxComment[]; more: boolean };

const mode = process.argv[2] as "start" | "wake";
const command = process.env.TRELLIS_SIM_COMMAND!;
const word = (pattern: RegExp) => pattern.exec(command)?.[1];

const url = word(/TRELLIS_URL='([^']*)'/)!;
const actor = word(/TRELLIS_ACTOR='([^']*)'/)!;
const title = word(/claude -n '([^']*)'/)!;
const role = /^agent:(manager|builder|reviewer)-/.exec(actor)![1] as Role;
// The command of a resumed manager holds no `trellis instructions` call, so
// the project comes from the tab title "CDE manager".
const project = word(/--project '([^']*)'/) ?? title.replace(/ manager$/, "");
const ticket = word(/--ticket '([^']*)'/);
const prUrl = word(/--pr '([^']*)'/);

const cli = join(import.meta.dir, "..", "..", "..", "..", "packages", "cli", "src", "index.ts");

const trellis = <T>(...args: string[]): T => {
	const stdout = execFileSync(process.execPath, [cli, "--url", url, "--as", actor, "--json", ...args], {
		encoding: "utf8",
	});
	console.log(`${actor}: trellis ${args.join(" ")}`);
	return JSON.parse(stdout) as T;
};

const comment = (identifier: string, body: string) => trellis("comment", identifier, "--body", body);

// The CLI reads the workspace, the terminal, and the Claude session from the
// variables that superset.ts sets.
const register = () =>
	trellis(
		"agents",
		"register",
		"--role",
		role,
		"--project",
		project,
		...(ticket === undefined ? [] : ["--ticket", ticket]),
	);

const liveStates = new Set(["starting", "running", "waiting"]);

const liveSession = (identifier: string, wanted: Role) =>
	trellis<{ sessions: Session[] }>("agents", "status", "--ticket", identifier).sessions.find(
		(session) => session.role === wanted && liveStates.has(session.state),
	);

const forward = (identifier: string, text: string) => {
	const builder = liveSession(identifier, "builder")!;
	execFileSync(process.env.TRELLIS_SUPERSET_BIN!, [
		...["terminals", "send", "--workspace", builder.workspaceId!, "--terminal", builder.terminalId!],
		...["--text", `trellis: ${identifier}: ${text}`],
	]);
};

// A simulated builder acts at once, so the manager moves the ticket to In
// Progress before it starts the builder. Otherwise the move could land after
// the builder's move to Agent Review.
const actOnTicket = (summary: InboxTicket) => {
	const { identifier } = summary;
	if (summary.status.slug === "todo" && liveSession(identifier, "builder") === undefined) {
		trellis("move", identifier, "in-progress");
		trellis("agents", "start", identifier);
		comment(identifier, `Started builder in Superset workspace ${identifier}.`);
	}
	if (summary.status.slug === "agent-review" && liveSession(identifier, "reviewer") === undefined) {
		const [pr] = trellis<Array<{ url: string }>>("pr", "list", identifier);
		trellis("agents", "review", identifier, "--pr", pr!.url);
		comment(identifier, `Started reviewer on ${pr!.url}.`);
	}
};

const actOnComment = (summary: InboxTicket, note: InboxComment) => {
	const { identifier } = summary;
	if (note.actor.name.startsWith("reviewer-") && note.body.startsWith("Verdict: clean")) {
		trellis("move", identifier, "human-review");
		comment(identifier, "The review is clean. Moved to Human Review.");
	}
	if (note.actor.kind === "human" && liveSession(identifier, "builder") !== undefined) {
		forward(identifier, note.body);
		if (summary.status.slug !== "in-progress") trellis("move", identifier, "in-progress");
		comment(identifier, "Forwarded the comment to the builder.");
	}
};

const managerTurn = () => {
	for (let more = true; more; ) {
		const inbox = trellis<Inbox>("agents", "inbox", "--project", project);
		const tickets = new Map(inbox.tickets.map((summary) => [summary.id, summary]));
		for (const summary of inbox.tickets) actOnTicket(summary);
		for (const note of inbox.comments) actOnComment(tickets.get(note.ticketId)!, note);
		more = inbox.more;
	}
};

const builderTurn = () => {
	register();
	comment(ticket!, "Builder started. Opening the pull request.");
	trellis("pr", "add", ticket!, failingPrUrl);
	trellis("move", ticket!, "agent-review");
	comment(ticket!, `Opened ${failingPrUrl}. Moved to Agent Review.`);
};

const reviewerTurn = () => {
	register();
	comment(ticket!, `Verdict: clean\nNo findings on ${prUrl}.`);
};

if (role === "manager") {
	if (mode === "start") register();
	managerTurn();
}
if (role === "builder") builderTurn();
if (role === "reviewer") reviewerTurn();
