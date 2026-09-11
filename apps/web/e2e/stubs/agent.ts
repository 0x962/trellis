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
//
// The agent-runs rewrite took `agents register`, `agents inbox`, `agents
// status`, `agents start <ticket>`, and `agents review` out of the CLI. The
// server keeps every one of those procedures, so this stub calls them over
// their OpenAPI routes with the same actor header. The CLI still carries
// `comment`, `move`, and `pr`, which stay on the CLI here.

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

// One server call, as the actor the command exports. A refusal throws with
// the server's body, which lands in agents.log beside the state file. A
// quiet call writes no log line, so a poll leaves one line, not fifty.
const api = async <T>(method: "GET" | "POST", path: string, body?: unknown, quiet = false): Promise<T> => {
	const response = await fetch(`${url}/api${path}`, {
		method,
		headers: { "content-type": "application/json", "x-trellis-actor": actor },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const text = await response.text();
	if (!quiet) console.log(`${actor}: ${method} ${path}`);
	if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text}`);
	return JSON.parse(text) as T;
};

// superset.ts sets the workspace, the terminal, and the Claude session, as a
// Superset terminal and Claude Code set them for a real agent.
const workspaceId = process.env.SUPERSET_WORKSPACE_ID!;
const terminalId = process.env.SUPERSET_TERMINAL_ID!;

const sessionsIn = (scope: string, quiet = false) =>
	api<{ sessions: Session[] }>("GET", `/agents/sessions?${scope}`, undefined, quiet);

const scopeOf = (identifier: string | undefined) =>
	identifier === undefined ? `project=${encodeURIComponent(project)}` : `ticket=${encodeURIComponent(identifier)}`;

// The server inserts the session, asks the runner for the workspace, and
// records the terminal in a last transaction. This stub boots in
// milliseconds, where Claude Code takes seconds, so it can register before
// that last transaction and claim the terminal the server is about to
// write. One unique index covers workspace and terminal, so the server's
// write then fails. The agent waits for its own row, as a real agent does
// by being slow, and gives up after five seconds so a real fault still
// shows as the failure it is.
const recorded = async () => {
	for (let tries = 0; tries < 100; tries += 1) {
		const { sessions } = await sessionsIn(scopeOf(ticket), true);
		if (sessions.some((session) => session.terminalId === terminalId)) return;
		await Bun.sleep(50);
	}
};

const register = async () => {
	await recorded();
	return api("POST", "/agents/register", {
		role,
		project,
		...(ticket === undefined ? {} : { ticket }),
		workspaceId,
		terminalId,
		claudeSessionId: process.env.CLAUDE_CODE_SESSION_ID!,
	});
};

const liveStates = new Set(["starting", "running", "waiting"]);

const liveSession = async (identifier: string, wanted: Role) => {
	const { sessions } = await sessionsIn(scopeOf(identifier));
	return sessions.find((session) => session.role === wanted && liveStates.has(session.state));
};

const forward = async (identifier: string, text: string) => {
	const builder = (await liveSession(identifier, "builder"))!;
	execFileSync(process.env.TRELLIS_SUPERSET_BIN!, [
		...["terminals", "send", "--workspace", builder.workspaceId!, "--terminal", builder.terminalId!],
		...["--text", `trellis: ${identifier}: ${text}`],
	]);
};

// A simulated builder acts at once, so the manager moves the ticket to In
// Progress before it starts the builder. Otherwise the move could land after
// the builder's move to Agent Review.
const actOnTicket = async (summary: InboxTicket) => {
	const { identifier } = summary;
	if (summary.status.slug === "todo" && (await liveSession(identifier, "builder")) === undefined) {
		trellis("move", identifier, "in-progress");
		await api("POST", "/agents/builder", { ticket: identifier });
		comment(identifier, `Started builder in Superset workspace ${identifier}.`);
	}
	if (summary.status.slug === "agent-review" && (await liveSession(identifier, "reviewer")) === undefined) {
		const [pr] = trellis<Array<{ url: string }>>("pr", "list", identifier);
		await api("POST", "/agents/reviewer", { ticket: identifier, prUrl: pr!.url });
		comment(identifier, `Started reviewer on ${pr!.url}.`);
	}
};

const actOnComment = async (summary: InboxTicket, note: InboxComment) => {
	const { identifier } = summary;
	if (note.actor.name.startsWith("reviewer-") && note.body.startsWith("Verdict: clean")) {
		trellis("move", identifier, "human-review");
		comment(identifier, "The review is clean. Moved to Human Review.");
	}
	if (note.actor.kind === "human" && (await liveSession(identifier, "builder")) !== undefined) {
		await forward(identifier, note.body);
		if (summary.status.slug !== "in-progress") trellis("move", identifier, "in-progress");
		comment(identifier, "Forwarded the comment to the builder.");
	}
};

const managerTurn = async () => {
	for (let more = true; more; ) {
		const inbox = await api<Inbox>("POST", "/agents/inbox", { project });
		const tickets = new Map(inbox.tickets.map((summary) => [summary.id, summary]));
		for (const summary of inbox.tickets) await actOnTicket(summary);
		for (const note of inbox.comments) await actOnComment(tickets.get(note.ticketId)!, note);
		more = inbox.more;
	}
};

const builderTurn = async () => {
	await register();
	comment(ticket!, "Builder started. Opening the pull request.");
	trellis("pr", "add", ticket!, failingPrUrl);
	trellis("move", ticket!, "agent-review");
	comment(ticket!, `Opened ${failingPrUrl}. Moved to Agent Review.`);
};

const reviewerTurn = async () => {
	await register();
	comment(ticket!, `Verdict: clean\nNo findings on ${prUrl}.`);
};

if (role === "manager") {
	if (mode === "start") await register();
	await managerTurn();
}
if (role === "builder") await builderTurn();
if (role === "reviewer") await reviewerTurn();
