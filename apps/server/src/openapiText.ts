// The prose and the examples the post-processed OpenAPI document carries,
// so an agent that reads /api/openapi.json alone can work.

export const ACTOR_HEADER_DESCRIPTION =
	"Who acts, as <human|agent>:<name>. The name is 1 to 64 printable ASCII characters without a colon. Required on every request whose method is not GET.";

export const ACTOR_HEADER_EXAMPLE = "agent:claude-code";

// The default address of the local server. A gateway or a proxy in front of it
// serves the same API under the name TRELLIS_PUBLIC_URL carries.
export const SERVERS = [{ url: "http://127.0.0.1:4521/api", description: "The local server" }];

export const TAGS = [
	{ name: "submanagers", description: "Delegated project scopes." },
	{ name: "harness accounts", description: "Configured account profiles and provider quota." },
	{ name: "needs you", description: "Work that requires a human decision." },
	{ name: "controller", description: "Durable manager messages and uncertain delivery decisions." },
	{ name: "flow executions", description: "Saved flow versions, local worker attempts, and human decisions." },
	{ name: "reviews", description: "Pull request diffs, local comments, and GitHub review actions." },
	{ name: "sessions", description: "Scratch sessions: a git repository with one agent, outside every project." },
	{
		name: "flows",
		description: "Flows: graphs of agent steps. A save replaces every node and edge of a flow at once.",
	},
	{ name: "projects", description: "The project tree. A root has a key; a sub-project has a parent and a slug." },
	{ name: "statuses", description: "The status set of a project. A sub-project inherits the nearest owner's set." },
	{ name: "tickets", description: "Tickets: list, board, counts, one ticket, and every write." },
	{ name: "timeline", description: "Comments and activity of one ticket, newest first." },
	{ name: "comments", description: "Comments on a ticket." },
	{
		name: "chat",
		description: "The chat room of a project tree: its channels and their messages. Live agents receive every post.",
	},
	{
		name: "notes",
		description: "Project notes: titled markdown that every agent of the project and its sub-projects reads at start.",
	},
	{ name: "attachments", description: "Files on a ticket. The bytes are served at GET /api/attachments/{id}/file." },
	{ name: "pull requests", description: "GitHub pull requests linked to a ticket, with their CI state." },
	{ name: "search", description: "Full text search over tickets and projects." },
	{ name: "brief", description: "The markdown brief an agent starts from." },
	{ name: "actors", description: "Every human and agent a mutation has carried." },
	{ name: "settings", description: "The server settings." },
	{ name: "system", description: "Health, the gh state, and backups." },
	{
		name: "agent runs",
		description: "Ticket agents, project managers, flow agents, their output, and their follow-ups.",
	},
];

export const DESCRIPTION = `trellis is a local ticket tracker for agent-driven work. Every action carries an actor.

## Desktop authentication

The desktop host requires an Authorization bearer token. Native agents receive TRELLIS_AUTH_TOKEN and TRELLIS_ATTEMPT_TOKEN in their environment. Send the attempt token in x-trellis-attempt. An expired attempt cannot change Trellis data. The CLI sends these headers from its environment.

## The actor header

Every non-GET request needs the header \`x-trellis-actor: <human|agent>:<name>\`. A GET request ignores the header. A request without it answers 400 ACTOR_REQUIRED; a malformed one answers 400 ACTOR_INVALID. The optional header \`x-trellis-session: <id>\` is stored with the activity a request writes.

## Refs

Every ref is case-insensitive on the way in and canonical on the way out.

| ref | grammar | example |
|---|---|---|
| TicketRef | a ULID or \`KEY-n\` | \`CDE-42\` |
| ProjectRef | a ULID, \`KEY\`, or \`KEY.slug(.slug)*\` | \`CDE\`, \`CDE.web.auth\` |
| StatusRef | a ULID, a slug, a name, or \`category:<category>\` | \`in-progress\`, \`In Progress\`, \`category:review\` |

## The list grammar

\`GET /api/tickets\` takes flat query parameters. A parameter that takes several values takes a comma list. \`parent=none\` keeps top-level tickets only. \`sort\` takes \`[-]updatedAt\`, \`createdAt\`, \`priority\`, \`number\`, \`status\`, or \`position\`; the default is \`-updatedAt\`. \`limit\` is 1 to 200; \`cursor\` continues a page and belongs to one filter and sort.

Example: \`GET /api/tickets?project=CDE&status=in-progress,agent-review&parent=none&ci=fail&sort=-updatedAt\`

## Rules for agents

An agent never deletes a ticket or a project without \`force\`. The server enforces this rule with 403 AGENT_CANNOT_DELETE.

## Two calls

Create a ticket:
curl -X POST http://127.0.0.1:4521/api/tickets -H 'x-trellis-actor: agent:claude-code' -H 'Content-Type: application/json' -d '{"project":"CDE","title":"First"}'

Move it to In Progress:
curl -X POST http://127.0.0.1:4521/api/tickets/CDE-1/move -H 'x-trellis-actor: agent:claude-code' -H 'Content-Type: application/json' -d '{"status":"in-progress"}'

## Versions and errors

Every response carries \`x-trellis-api-version\`. Every error is JSON with \`code\`, \`status\`, \`message\`, and \`data\`; the codes are listed on each operation.
`;

// One example per request body, keyed by `<METHOD> <path>`.
export const BODY_EXAMPLES: Record<string, unknown> = {
	"POST /submanagers": {
		project: "CDE.web",
		brief: "Complete the web tickets and prepare them for review.",
		requestId: "CDE.web:manager",
	},
	"POST /submanagers/{id}/retire": {},
	"POST /harness-accounts": { name: "Work", harness: "claude" },
	"PATCH /harness-accounts/{id}": { isDefault: true },
	"POST /agent-runs/{id}/resume": {
		expectedTerminalId: "stopped-attempt-id",
		requestId: "CDE-42:resume",
		accountId: "01J9Z000000000000000000001",
	},
	"POST /agent-runs/{runId}/checks": {
		command: "bun",
		args: ["test"],
		timeoutMs: 60000,
		requestId: "5178cacf-d5b1-4223-8e2f-4fb3fb3f7710",
	},
	"POST /agent-runs/{runId}/artifacts": { path: "src/result.ts" },
	"POST /agent-runs/{id}/permission": { requestId: "tool-request-1", behavior: "deny" },
	"POST /agent-runs/{id}/interrupt": {},
	"POST /agent-runs/{id}/terminal/input": { text: "pwd\r" },
	"POST /agent-runs/{id}/terminal/resize": { cols: 100, rows: 32 },
	"POST /manager-dispatches/{id}/retry": {},
	"POST /manager-dispatches/{id}/received": {},
	"POST /manager-dispatches/{id}/handle": {
		generation: 1,
		outcomes: [
			{ ticketId: "01J9Z0000000000000000000A1", status: "queued", reason: "An active worker owns this ticket." },
		],
	},

	"POST /native-work/stop": {},
	"POST /needs-you/list": {},
	"POST /needs-you/summary": {},
	"POST /needs-you/update": { id: "mention:01J9Z0000000000000000000A1", action: "ignore" },
	"POST /gh/check": {},
	"POST /flow-executions": {
		flow: "review",
		ticket: "CDE-1",
		expectedVersion: 1,
		requestId: "5178cacf-d5b1-4223-8e2f-4fb3fb3f7710",
	},
	"POST /flow-executions/{id}/decision": {
		key: "step:step:0",
		approved: true,
		output: "Reviewed locally.",
		expectedRevision: 1,
	},
	"POST /flow-executions/{id}/cancel": { expectedRevision: 1 },
	"POST /reviews/open": { pr: "acme/web#12" },
	"POST /reviews/status": { pr: "acme/web#12" },
	"POST /reviews/refresh": { pr: "acme/web#12" },
	"POST /reviews/metadata": { pr: "acme/web#12" },
	"POST /reviews/mine": {},
	"POST /reviews/file": {
		pr: "acme/web#12",
		revisionId: "01J9Z000000000000000000001",
		path: "src/app.ts",
		side: "new",
	},
	"POST /reviews/threads": {
		pr: "acme/web#12",
		path: "src/app.ts",
		line: 12,
		body: "This branch drops the saved value.",
	},
	"POST /reviews/threads/{id}/reply": { body: "Fixed in the latest commit." },
	"POST /reviews/threads/{id}/resolve": { resolved: true },
	"PATCH /reviews/messages/{id}": { body: "The empty branch drops the saved value.", expectedVersion: 1 },
	"POST /reviews/messages/{id}/reaction": { reaction: "+1", remove: false },
	"POST /reviews/submit": {
		pr: "acme/web#12",
		headSha: "0123456789abcdef",
		verdict: "comment",
		body: "Review complete.",
	},
	"POST /reviews/import-margin": { source: "/Users/me/.margin/comments", dryRun: true, files: [] },
	"POST /reviews/action": { pr: "acme/web#12", headSha: "0123456789abcdef", action: "ready" },
	"POST /reviews/runs": { pr: "acme/web#12", action: "list" },
	"POST /flows": { name: "PR review", description: "Review a pull request with parallel checkers." },
	"PATCH /flows/{flow}": { briefing: "Review the pull request at {TARGET}.", expectedVersion: 2 },
	"PUT /flows/{flow}/graph": {
		nodes: [
			{
				id: "01J9Z0000000000000000000N1",
				parentId: null,
				kind: "agent",
				title: "Summarize the change",
				instruction: "Summarize the diff in five lines.",
				minutes: null,
				maxRounds: null,
				x: 0,
				y: 0,
				width: null,
				height: null,
			},
			{
				id: "01J9Z0000000000000000000N2",
				parentId: null,
				kind: "gate",
				title: "Backend relevant?",
				instruction: "Does the change touch the server?",
				minutes: null,
				maxRounds: null,
				x: 280,
				y: 0,
				width: null,
				height: null,
			},
		],
		edges: [
			{
				id: "01J9Z0000000000000000000E1",
				fromNodeId: "01J9Z0000000000000000000N1",
				toNodeId: "01J9Z0000000000000000000N2",
				branch: "out",
			},
		],
		expectedVersion: 1,
	},
	"POST /projects": { key: "CDE", name: "Code" },
	"PATCH /projects/{project}": { name: "Code, renamed", description: "The desktop app." },
	"POST /projects/{project}/move": { parent: "CDE", after: "CDE.web" },
	"PUT /projects/{project}/repos": { repos: [{ owner: "acme", repo: "web" }] },
	"POST /projects/{project}/statuses": { name: "Blocked", category: "started", color: "amber" },
	"PATCH /projects/{project}/statuses/{status}": { name: "Doing" },
	"PUT /projects/{project}/statuses/order": {
		statuses: ["01J9Z0000000000000000000A1", "01J9Z0000000000000000000A2"],
	},
	"POST /tickets": {
		project: "CDE",
		title: "Add dark mode",
		description: "Follow the system setting.",
		priority: "high",
	},
	"PATCH /tickets/{ticket}": { title: "Add dark mode", priority: "urgent", expectedVersion: 3 },
	"POST /tickets/{ticket}/move": { status: "in-progress", after: "CDE-41" },
	"POST /tickets/update-many": { tickets: ["CDE-1", "CDE-2"], priority: "low" },
	"POST /tickets/delete-many": { tickets: ["CDE-1", "CDE-2"] },
	"POST /tickets/{ticket}/comments": { body: "Tests pass. Ready for review." },
	"POST /comments/{id}/resolve": { resolved: true },
	"POST /projects/{project}/chat": { channel: "#release", aiOnly: false },
	"POST /projects/{project}/chat/attachments": {
		file: "<the file bytes as one multipart part named file>",
		name: "shot.png",
	},
	"POST /projects/{project}/chat/{channel}/messages": {
		body: "@Builder the migration on main is merged. Rebase before you push.",
	},
	"PATCH /comments/{id}": { body: "Tests pass. Ready for a human review." },
	"POST /projects/{project}/notes": {
		title: "Fresh worktree",
		body: "A new worktree has no node_modules. Run bun install before the first check.",
		audience: "worker",
	},
	"PATCH /notes/{id}": {
		body: "Free disk: 89 GiB at 16:45 UTC. Large checks stay paused below 100 GiB.",
		expiresAt: null,
	},
	"POST /tickets/{ticket}/attachments": { file: "<the file bytes as one multipart part named file>", name: "shot.png" },
	"POST /tickets/{ticket}/prs": { url: "https://github.com/acme/web/pull/12" },
	"PUT /settings": {
		defaultActorName: "dana",
	},
	"POST /agent-runs": {
		ticket: "CDE-42",
		harness: { preset: "codex", model: "openai/gpt-5.6-sol", effort: "high" },
	},
	"POST /sessions": { prompt: "Prototype a rate limiter in Go.", harness: { preset: "claude" } },
	"POST /agent-runs/{id}/send": { text: "The CI run is red. Read the failing step and fix it." },
};
